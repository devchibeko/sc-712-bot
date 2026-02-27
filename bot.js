const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = '8714937938:AAEvnpapkevqoCey80qJRO0nAmFuphDKkdg';
const ADMIN_ID = 5056923540; // <-- O'zingizning Telegram ID

const bot = new TelegramBot(token, { polling: true });

let users = new Set();
let channels = [];
let waitingPrivate = false;
let tempPrivateLink = "";
let waitingDelete = false;
let waitingReklama = false;

// ===== LOAD DATA =====
if (fs.existsSync("users.json")) {
    users = new Set(JSON.parse(fs.readFileSync("users.json")));
}

if (fs.existsSync("channels.json")) {
    channels = JSON.parse(fs.readFileSync("channels.json"));
}

function saveData() {
    fs.writeFileSync("users.json", JSON.stringify([...users], null, 2));
    fs.writeFileSync("channels.json", JSON.stringify(channels, null, 2));
}

// ================= START =================
bot.onText(/^\/start$/, async (msg) => {
    const chatId = msg.chat.id;

    users.add(chatId);
    saveData();

    if (channels.length === 0) {
        return bot.sendMessage(chatId, "Botga xush kelibsiz ✅");
    }

    const keyboard = channels.map(ch => ([
        { text: "📢 Kanal", url: ch.link }
    ]));

    keyboard.push([{ text: "✅ Tekshirish", callback_data: "check_sub" }]);

    bot.sendMessage(chatId,
        "📌 Barcha kanallarga obuna bo‘ling va tekshiring.",
        { reply_markup: { inline_keyboard: keyboard } }
    );
});

// ================= OBUNA TEKSHIRISH =================
bot.on('callback_query', async (query) => {
    if (query.data !== "check_sub") return;

    const userId = query.from.id;
    let allJoined = true;

    for (let ch of channels) {
        try {
            const member = await bot.getChatMember(ch.id, userId);
            if (!["member", "administrator", "creator"].includes(member.status)) {
                allJoined = false;
                break;
            }
        } catch {
            allJoined = false;
            break;
        }
    }

    if (allJoined) {
        bot.sendMessage(userId, "🎉 Tabriklaymiz! Obuna tasdiqlandi.");
    } else {
        bot.sendMessage(userId, "❌ Siz barcha kanallarga obuna bo‘lmagansiz!");
    }

    bot.answerCallbackQuery(query.id);
});

// ================= ADMIN =================

// /stats
bot.onText(/^\/stats$/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    bot.sendMessage(ADMIN_ID, `👥 Foydalanuvchilar soni: ${users.size}`);
});

// /addchannel
bot.onText(/^\/addchannel$/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;

    bot.sendMessage(ADMIN_ID,
        "Kanal username yoki link yuboring:\n\nPublic:\n@kanal yoki https://t.me/kanal\n\nPrivate:\nhttps://t.me/+invitecode"
    );

    waitingPrivate = false;
});

// /delchannel
bot.onText(/^\/delchannel$/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;

    if (channels.length === 0) {
        return bot.sendMessage(ADMIN_ID, "Kanal yo‘q.");
    }

    let list = "O‘chirish uchun chat_id yuboring:\n\n";
    channels.forEach(ch => {
        list += `${ch.id} | ${ch.link}\n`;
    });

    bot.sendMessage(ADMIN_ID, list);
    waitingDelete = true;
});

// /reklama
bot.onText(/^\/reklama$/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;

    bot.sendMessage(ADMIN_ID, "Reklama matnini yuboring:");
    waitingReklama = true;
});

// ================= ADMIN MESSAGE HANDLER =================
bot.on('message', async (msg) => {

    if (msg.from.id !== ADMIN_ID) return;

    // REKLAMA
    if (waitingReklama && msg.text && !msg.text.startsWith("/")) {
        waitingReklama = false;

        let success = 0;
        let failed = 0;

        for (let user of users) {
            try {
                await bot.sendMessage(user, msg.text);
                success++;
            } catch {
                failed++;
            }
        }

        return bot.sendMessage(ADMIN_ID,
            `📢 Reklama tugadi\n\n✅Yuborilgan ${success}\n❌Yuborilmagan ${failed}`
        );
    }

    // DELETE
    if (waitingDelete && msg.text && !msg.text.startsWith("/")) {
        waitingDelete = false;

        channels = channels.filter(ch => ch.id.toString() !== msg.text);
        saveData();

        return bot.sendMessage(ADMIN_ID, "🗑 Kanal o‘chirildi");
    }

    // PRIVATE FORWARD
    if (waitingPrivate && msg.forward_from_chat) {
        const chat = msg.forward_from_chat;

        channels.push({
            id: chat.id,
            link: tempPrivateLink
        });

        saveData();
        waitingPrivate = false;
        tempPrivateLink = "";

        return bot.sendMessage(ADMIN_ID, "✅ Private kanal qo‘shildi");
    }

    // ADD CHANNEL PROCESS
    if (msg.text && !msg.text.startsWith("/")) {

        const text = msg.text;

        if (text.startsWith("@") || text.includes("t.me/")) {

            // PRIVATE
            if (text.includes("+")) {
                waitingPrivate = true;
                tempPrivateLink = text;

                return bot.sendMessage(ADMIN_ID,
                    "🔐 Endi shu kanaldan biror postni forward qiling."
                );
            }

            // PUBLIC
            let username = text
                .replace("https://t.me/", "")
                .replace("@", "")
                .trim();

            try {
                const chat = await bot.getChat("@" + username);

                channels.push({
                    id: chat.id,
                    link: "https://t.me/" + username
                });

                saveData();

                return bot.sendMessage(ADMIN_ID, "✅ Public kanal qo‘shildi");

            } catch {
                return bot.sendMessage(ADMIN_ID,
                    "❌ Bot kanalga admin qilinganmi?"
                );
            }
        }
    }
});