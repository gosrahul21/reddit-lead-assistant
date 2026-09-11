require('dotenv').config();
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

async function fetchEmails() {
    // Wait until client connects and authorizes
    const client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
            user: process.env.GMAIL_USER,
            // Remember to use an App Password if you have 2FA enabled on Gmail
            pass: process.env.GMAIL_PASS 
        },
        logger: false // Set to true for debugging
    });

    try {
        await client.connect();
        console.log('Connected to Gmail via IMAP');

        // Select and lock a mailbox. Throws if mailbox does not exist
        let lock = await client.getMailboxLock('INBOX');
        try {
            console.log('Fetching recent emails...');
            
            // fetch latest 5 emails
            // client.mailbox includes information about currently selected mailbox
            const totalMessages = client.mailbox.exists;
            const fetchSequence = totalMessages > 0 
                ? `${Math.max(1, totalMessages - 4)}:*` 
                : '1:*';
            
            const messages = await client.fetch(fetchSequence, { source: true, envelope: true });
            for await (let message of messages) {
                // Parse the email source
                const parsed = await simpleParser(message.source);
                console.log(`\n--- Email #${message.seq} ---`);
                console.log(`From: ${parsed.from.text}`);
                console.log(`Subject: ${parsed.subject}`);
                console.log(`Date: ${parsed.date}`);
                console.log(`Text preview: ${parsed.text ? parsed.text.substring(0, 100) : ''}...`);
            }
        } finally {
            // Make sure lock is released, otherwise next `getMailboxLock()` never resolves
            lock.release();
        }

        // log out and close connection
        await client.logout();
    } catch (err) {
        console.error('Error fetching emails:', err);
    }
}

fetchEmails();
