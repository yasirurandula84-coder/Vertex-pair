const express = require('express');
const fs = require('fs');
const { exec } = require("child_process");
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");
const { upload } = require('./mega');

function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).send({ error: "Phone number is required" });

    async function DanuwaPair() {
        // සෑම විටම පිරිසිදු session එකකින් ආරම්භ කරන්න
        removeFile('./session'); 
        const { state, saveCreds } = await useMultiFileAuthState(`./session`);

        try {
            let DanuwaPairWeb = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                // මෙන්න මෙතන "Chrome (Linux)" දීමෙන් Notification එක ඉක්මනින් එනවා
                browser: ["Ubuntu", "Chrome", "20.0.04"], 
            });

            if (!DanuwaPairWeb.authState.creds.registered) {
                await delay(3000); // සර්වර් එකට සම්බන්ධ වීමට සුළු වෙලාවක් දෙන්න
                num = num.replace(/[^0-9]/g, '');
                
                try {
                    const code = await DanuwaPairWeb.requestPairingCode(num);
                    if (!res.headersSent) {
                        await res.send({ code });
                    }
                } catch (pairErr) {
                    console.error("Pairing Code Error:", pairErr);
                    if (!res.headersSent) res.send({ code: "Error requesting code" });
                }
            }

            DanuwaPairWeb.ev.on('creds.update', saveCreds);

            DanuwaPairWeb.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    try {
                        await delay(5000); // දත්ත sync වීමට වෙලාව දෙන්න
                        const auth_path = './session/creds.json';
                        const user_jid = jidNormalizedUser(DanuwaPairWeb.user.id);

                        // Mega Upload Logic
                        const mega_url = await upload(fs.createReadStream(auth_path), `${Math.random().toString(36).substring(7)}.json`);
                        const string_session = mega_url.replace('https://mega.nz/file/', '');

                        // User ගේ inbox එකට session ID එක යැවීම
                        await DanuwaPairWeb.sendMessage(user_jid, { text: string_session });

                        await delay(2000);
                        removeFile('./session'); // වැඩේ ඉවර නිසා session එක මකන්න
                        process.exit(0); 

                    } catch (e) {
                        console.log("Upload Error:", e);
                        exec('pm2 restart DANUWA-MD');
                    }
                } 
                
                if (connection === "close") {
                    let reason = lastDisconnect?.error?.output?.statusCode;
                    if (reason !== 401) { // 401 කියන්නේ logout වීම, ඒක නෙවෙයි නම් නැවත උත්සාහ කරන්න
                        DanuwaPair();
                    }
                }
            });

        } catch (err) {
            console.error("Main Error:", err);
            exec('pm2 restart DANUWA-MD');
            removeFile('./session');
        }
    }
    return await DanuwaPair();
});

module.exports = router;
