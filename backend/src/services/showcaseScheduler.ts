import cron from 'node-cron';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { query } from '../db';

export const SALES_CONTACTS = [
  { name: 'VS FASHION Sales 1', phone: '+918796333844', rawPhone: '8796333844' },
  { name: 'VS FASHION Sales 2', phone: '+918796893844', rawPhone: '8796893844' },
  { name: 'VS FASHION Sales 3', phone: '+918796443844', rawPhone: '8796443844' },
];

export const CALL_CONTACT = {
  name: 'VS FASHION Wholesale Desk',
  phone: '+919718503340',
  rawPhone: '9718503340',
  note: 'Please save this number for future connect',
};

export const COMMUNITY_LINK = 'https://chat.whatsapp.com/CdsyxZokQzo39x4hBzW6O0';

export const BRAND_DETAILS = {
  company: 'VS FASHION',
  brand: 'DESUKA',
  address: 'IX/6362, Netaji Gali, Gandhi Nagar, Delhi — 110031',
  email: 'wholesale@desukafashion.com',
  website: 'https://desukafashion.com',
  instagram: 'https://instagram.com/desukab2b',
  facebook: 'https://facebook.com/desukab2b',
  youtube: 'https://youtube.com/@DesukaByVSFashion',
  googleMaps: 'https://share.google/8egrK2LC6jGeJjAVa',
  googleSearchTitle: 'VS Fashion DESUKA / VS Fashion Gandhi Nagar Delhi',
  verifiedOn: ['IndiaMart', 'JustDial', 'TradeIndia'],
  hours: '10 AM – 7 PM | Daily — Except Monday',
};

// Generates a new 24-hour showcase link
export async function generateShowcaseLink(userId?: number, customItemIds?: number[]): Promise<{ token: string; expires_at: Date; count: number }> {
  let itemIds: number[] = customItemIds || [];

  if (!itemIds || itemIds.length === 0) {
    // Select all items flagged for showcase
    const showcaseItems = await query(
      `SELECT id FROM items WHERE is_in_showcase = TRUE ORDER BY id ASC`
    );
    itemIds = showcaseItems.rows.map(r => r.id);

    // If no items flagged, fallback to top 24 active in-stock designs
    if (itemIds.length === 0) {
      const fallbackItems = await query(
        `SELECT i.id FROM items i 
         JOIN stock s ON s.item_id = i.id 
         WHERE s.is_available = TRUE AND s.sets_count > 0 
         ORDER BY i.created_at DESC LIMIT 24`
      );
      itemIds = fallbackItems.rows.map(r => r.id);
    }
  }

  // Generate unique 16-char random token with sk_ prefix
  const token = 'sk_' + crypto.randomBytes(8).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO showcase_links (token, item_ids, expires_at, created_by)
     VALUES ($1, $2, $3, $4)`,
    [token, itemIds, expiresAt, userId || null]
  );

  console.log(`[Showcase] Generated fresh 24h showcase link: token=${token}, items=${itemIds.length}, expires=${expiresAt.toISOString()}`);
  return { token, expires_at: expiresAt, count: itemIds.length };
}

// Sends showcase email to sales team
export async function sendShowcaseEmail(token: string, targetEmail?: string): Promise<{ success: boolean; message: string }> {
  try {
    // Retrieve settings
    const settingsRes = await query('SELECT key, value FROM showcase_settings');
    const settings: Record<string, string> = {};
    settingsRes.rows.forEach(r => { settings[r.key] = r.value; });

    const recipient = targetEmail || settings['daily_email_recipient'] || 'wholesale@desukafashion.com';
    let baseUrl = settings['base_url'] || process.env.BASE_URL || 'https://catalog.desukafashion.com';
    if (baseUrl.includes('lms.desukafashion.com')) {
      baseUrl = 'https://catalog.desukafashion.com';
    }
    const showcaseUrl = `${baseUrl}/showcase/${token}`;
    const todayStr = new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Check SMTP config from settings or environment
    const smtpHost = settings['smtp_host'] || process.env.SMTP_HOST;
    const smtpPort = parseInt(settings['smtp_port'] || process.env.SMTP_PORT || '587');
    const smtpUser = settings['smtp_user'] || process.env.SMTP_USER;
    const smtpPass = settings['smtp_pass'] || process.env.SMTP_PASS;
    const smtpFrom = settings['smtp_from'] || process.env.SMTP_FROM || 'wholesale@desukafashion.com';

    const whatsappShareText = encodeURIComponent(
      `*DESUKA by VS FASHION — Exclusive Wholesale Showcase*\n\n` +
      `Check out our latest curated wholesale collection (Valid for 24 hours):\n${showcaseUrl}\n\n` +
      `📍 IX/6362, Netaji Gali, Gandhi Nagar, Delhi — 110031\n` +
      `📞 Call: 9718503340 | WhatsApp: 8796333844\n` +
      `🌐 desukafashion.com`
    );
    const whatsappShareLink = `https://api.whatsapp.com/send?text=${whatsappShareText}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #334155;">
        <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; letter-spacing: 2px; color: #ffffff;">DESUKA by VS FASHION</h1>
          <p style="margin: 6px 0 0; color: #e2e8f0; font-size: 13px; letter-spacing: 1px;">EXCLUSIVE 24-HOUR VIP WHOLESALE SHOWCASE</p>
        </div>

        <div style="padding: 24px;">
          <p style="font-size: 15px; line-height: 1.5; color: #cbd5e1;">Good Morning Sales Team,</p>
          <p style="font-size: 14px; line-height: 1.6; color: #94a3b8;">
            Here is your daily curated catalog showcase link for <strong>${todayStr}</strong>. This VIP link is valid for <strong>24 hours only</strong>. Share it with clients who reach out via WhatsApp Business.
          </p>

          <div style="background: #1e293b; border-radius: 8px; padding: 18px; margin: 20px 0; border: 1px solid #475569; text-align: center;">
            <p style="margin: 0 0 10px; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Customer 24h Showcase Link</p>
            <a href="${showcaseUrl}" target="_blank" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; font-size: 15px; word-break: break-all;">
              Open 24h Showcase Preview
            </a>
            <p style="margin: 12px 0 0; font-size: 12px; color: #38bdf8; word-break: break-all;">
              ${showcaseUrl}
            </p>
          </div>

          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${whatsappShareLink}" target="_blank" style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; font-size: 14px;">
              💬 Share Directly to WhatsApp
            </a>
          </div>

          <div style="background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
            <h4 style="margin: 0 0 8px; font-size: 13px; color: #f59e0b; text-transform: uppercase;">Showcase Rules & Security</h4>
            <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #cbd5e1; line-height: 1.6;">
              <li>Prices, set quantities, and stock numbers are strictly hidden from clients.</li>
              <li>Only default clean catalog images are displayed.</li>
              <li>After 24 hours, the link gracefully redirects clients to connect with sales team numbers.</li>
            </ul>
          </div>

          <div style="border-top: 1px solid #334155; padding-top: 16px; font-size: 12px; color: #64748b; line-height: 1.6;">
            <p style="margin: 2px 0;"><strong>VS FASHION — DESUKA</strong></p>
            <p style="margin: 2px 0;">📍 IX/6362, Netaji Gali, Gandhi Nagar, Delhi — 110031</p>
            <p style="margin: 2px 0;">📞 Call: 9718503340 | 📧 wholesale@desukafashion.com</p>
            <p style="margin: 2px 0;">🌐 <a href="https://desukafashion.com" style="color: #64748b;">desukafashion.com</a></p>
          </div>
        </div>
      </div>
    `;

    if (smtpHost && smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      await transporter.sendMail({
        from: `"DESUKA by VS FASHION" <${smtpFrom}>`,
        to: recipient,
        subject: `[DESUKA B2B] Today's 24-Hour VIP Showcase Link (${new Date().toLocaleDateString('en-IN')})`,
        html: htmlBody,
      });

      console.log(`[Showcase Email] Successfully sent daily link to ${recipient}`);
      return { success: true, message: `Email sent to ${recipient}` };
    } else {
      console.log(`[Showcase Email] SMTP credentials not set. Showcase URL generated: ${showcaseUrl}`);
      // Record in settings as last generated link so it can be copied directly
      await query(
        `INSERT INTO showcase_settings (key, value, updated_at)
         VALUES ('last_generated_url', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [showcaseUrl]
      );
      return { success: true, message: `Showcase link generated: ${showcaseUrl} (SMTP not configured for automatic outgoing email)` };
    }
  } catch (err: any) {
    console.error('[Showcase Email] Failed to send email:', err);
    return { success: false, message: err.message || 'Failed to send email' };
  }
}

// Daily 7:00 AM IST Cron Job
export function initializeShowcaseCron(): void {
  // Cron schedule: '0 7 * * *' (7:00 AM daily)
  // node-cron supports timezone option
  cron.schedule('0 7 * * *', async () => {
    console.log('[Showcase Cron] Triggering 7:00 AM daily showcase generation...');
    try {
      const link = await generateShowcaseLink();
      await sendShowcaseEmail(link.token);
    } catch (err) {
      console.error('[Showcase Cron] Daily showcase generation failed:', err);
    }
  }, {
    timezone: 'Asia/Kolkata'
  });

  console.log('[Showcase Cron] Daily 7:00 AM IST showcase cron job initialized.');
}
