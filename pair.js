import express from "express";
import fs from "fs";
import pino from "pino";
import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pn from "awesome-phonenumber";
import { upload } from "./mega.js";

const router = express.Router();

function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error("Error removing file:", e);
    }
}

function getMegaFileId(url) {
    try {
        const match = url.match(/\/file\/([^#]+#[^\/]+)/);
        return match ? match[1] : null;
    } catch (error) {
        return null;
    }
}

router.get("/", async (req, res) => {
    let num = req.query.number;
    let dirs = "./" + (num || `session`);

    await removeFile(dirs);
    num = num.replace(/[^0-9]/g, "");

    const phone = pn("+" + num);
    if (!phone.isValid()) {
        if (!res.headersSent) {
            return res.status(400).send({
                code: "Invalid phone number. Please enter your full international number.",
            });
        }
        return;
    }
    num = phone.getNumber("e164").replace("+", "");

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version } = await fetchLatestBaileysVersion();
            let VexterBot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(
                        state.keys,
                        pino({ level: "fatal" }).child({ level: "fatal" }),
                    ),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Chrome"), // Professional Look
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
            });

            VexterBot.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect, isNewLogin } = update;

                if (connection === "open") {
                    console.log("✅ VEXTER-MD Connected successfully!");
                    
                    try {
                        const credsPath = dirs + "/creds.json";
                        const megaUrl = await upload(
                            credsPath,
                            `VEXTER_MD_${num}_${Date.now()}.json`,
                        );
                        const megaFileId = getMegaFileId(megaUrl);

                        if (megaFileId) {
                            // --- 🧬 THE BRANDING PREFIX LOGIC ---
                            const finalSessionID = `VEXTER-MD;${megaFileId}`;
                            // ------------------------------------

                            const userJid = jidNormalizedUser(num + "@s.whatsapp.net");
                            
                            // WhatsApp එකට යවන ලස්සන මැසේජ් එක
                            const msg = `🧬 *VEXTER-MD SESSION CONNECTED* 🧬\n\n` +
                                        `*ID:* \`${finalSessionID}\`\n\n` +
                                        `> _Copy the ID above and use it in your config._\n\n` +
                                        `*Created By Dexter* 🧬`;

                            await VexterBot.sendMessage(userJid, { text: msg });
                            console.log("📄 VEXTER-MD Session ID sent to user");

                            if (!res.headersSent) {
                                res.send({ code: "Success! Check your WhatsApp." });
                            }
                        }

                        await delay(2000);
                        removeFile(dirs);
                        process.exit(0);
                    } catch (error) {
                        console.error("❌ Mega Upload Error:", error);
                        removeFile(dirs);
                        process.exit(1);
                    }
                }

                if (connection === "close") {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode !== 401) {
                        initiateSession();
                    }
                }
            });

            if (!VexterBot.authState.creds.registered) {
                await delay(3000);
                num = num.replace(/[^\d+]/g, "");
                if (num.startsWith("+")) num = num.substring(1);

                try {
                    let code = await VexterBot.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    if (!res.headersSent) {
                        await res.send({ code });
                    }
                } catch (error) {
                    if (!res.headersSent) {
                        res.status(503).send({ code: "Failed to get pairing code." });
                    }
                }
            }

            VexterBot.ev.on("creds.update", saveCreds);
        } catch (err) {
            console.error("Error:", err);
            if (!res.headersSent) res.status(503).send({ code: "Service Unavailable" });
        }
    }

    await initiateSession();
});

// ... (ඉතිරි export සහ error handling ටික එලෙසම තියෙන්න දෙන්න)
export default router;
