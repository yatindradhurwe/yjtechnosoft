/**
 * Built-in email templates (Admin › Marketing › Email Templates).
 * "layout" templates are rich text wrapped in the branded email layout;
 * "html" templates are complete, designed emails edited as HTML.
 * Placeholders: {{name}} {{first_name}} {{email}} {{company}} {{company_name}} {{site_name}}
 * {{site_url}} {{our_phone}} {{our_email}} {{year}} {{unsubscribe_url}}
 */

const BTN = (label, href) =>
  `<table cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="background:#1d6fb8;border-radius:8px"><a href="${href}" style="display:inline-block;padding:12px 26px;color:#ffffff;font-weight:600;text-decoration:none;font-family:Segoe UI,Arial,sans-serif">${label}</a></td></tr></table>`;

/** Shared frame for the designed (html) templates */
const frame = (hero, content) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{site_name}}</title></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden">
  <tr><td style="background:#0b1b33;padding:18px 28px;border-bottom:4px solid #f7c41a">
    <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.3px">{{site_name}}</span>
    <span style="color:#f7c41a;font-size:12px;float:right;line-height:28px">One Stop IT Solution</span>
  </td></tr>
  ${hero}
  <tr><td style="padding:28px;font-size:15px;line-height:1.7">${content}</td></tr>
  <tr><td style="background:#0b1b33;padding:20px 28px;color:#cbd5e1;font-size:12px;line-height:1.7">
    <b style="color:#ffffff">{{company_name}}</b><br>
    {{our_phone}} · <a href="mailto:{{our_email}}" style="color:#f7c41a;text-decoration:none">{{our_email}}</a> · <a href="{{site_url}}" style="color:#f7c41a;text-decoration:none">{{site_url}}</a><br>
    <span style="color:#94a3b8">You are receiving this because you are in touch with {{site_name}}. <a href="{{unsubscribe_url}}" style="color:#94a3b8">Unsubscribe</a></span>
  </td></tr>
</table></td></tr></table></body></html>`;

// solid colour first for Outlook, which ignores gradients
const hero = (bg, kicker, title, text) => `<tr><td bgcolor="${bg.match(/#[0-9a-f]{6}/i)[0]}" style="background:${bg.match(/#[0-9a-f]{6}/i)[0]};background:${bg};padding:38px 28px;text-align:center">
    <div style="color:#f7c41a;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${kicker}</div>
    <div style="color:#ffffff;font-size:28px;font-weight:700;line-height:1.25;margin:10px 0">${title}</div>
    <div style="color:#dbeafe;font-size:15px">${text}</div>
  </td></tr>`;

const feature = (icon, title, text) => `<td width="50%" valign="top" style="padding:8px"><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px">
  <div style="font-size:22px">${icon}</div><div style="font-weight:700;margin:6px 0 4px">${title}</div><div style="font-size:13px;color:#475569;line-height:1.5">${text}</div></div></td>`;

module.exports = [
  {
    name: 'Thank you for your enquiry',
    category: 'follow_up',
    subject: 'Thanks for reaching out, {{first_name}}!',
    preheader: 'Here is what happens next with your enquiry.',
    format: 'layout',
    body: `<p>Hi {{first_name}},</p>
<p>Thank you for getting in touch with <strong>{{site_name}}</strong>. We have received your enquiry and one of our consultants will call you within one working day.</p>
<p>Meanwhile, here is what we can help you with:</p>
<ul><li>Website design &amp; development</li><li>Custom software, CRM &amp; ERP</li><li>Android / iOS mobile apps</li><li>SEO, digital marketing, domain &amp; hosting</li></ul>
<p>If it is urgent, call or WhatsApp us on <strong>{{our_phone}}</strong>.</p>
<p>Warm regards,<br>Team {{site_name}}</p>`,
  },
  {
    name: 'Monthly newsletter',
    category: 'newsletter',
    subject: '{{site_name}} – what is new this month',
    preheader: 'Recent projects, tips and offers from {{site_name}}.',
    format: 'layout',
    body: `<p>Hi {{first_name}},</p>
<p>Here is a quick round-up of what has been happening at {{site_name}} this month.</p>
<h3>🚀 Recently launched</h3>
<p>Write two or three lines about a project you delivered recently and the result for the client.</p>
<h3>💡 Tip of the month</h3>
<p>Share one practical tip – for example, why a fast, mobile-friendly website brings more enquiries.</p>
<h3>🎁 Offer</h3>
<p>Mention a limited-time offer and how to claim it.</p>
<p>Want to discuss your next project? Just reply to this email.</p>
<p>Regards,<br>Team {{site_name}}</p>`,
  },
  {
    name: 'Hosting / AMC renewal offer',
    category: 'promotion',
    subject: '{{first_name}}, keep your website running smoothly',
    preheader: 'Renew hosting, domain or AMC early and save.',
    format: 'layout',
    body: `<p>Dear {{name}},</p>
<p>Your website is the face of <strong>{{company}}</strong> online. To keep it fast, secure and always available, renew your hosting, domain and Annual Maintenance Contract with us before they expire.</p>
<ul><li>Daily backups and SSL certificate</li><li>Security updates and uptime monitoring</li><li>Content changes and priority support</li></ul>
<p>Reply to this email or call <strong>{{our_phone}}</strong> and we will share your renewal quote today.</p>
<p>Thank you for trusting us,<br>Team {{site_name}}</p>`,
  },
  {
    name: 'Feedback request',
    category: 'follow_up',
    subject: 'How did we do, {{first_name}}?',
    preheader: 'Two minutes of your time helps us serve you better.',
    format: 'layout',
    body: `<p>Hi {{first_name}},</p>
<p>Thank you for working with {{site_name}}. We would love to hear how your experience was – what went well and what we can improve.</p>
<p>Simply reply to this email with your feedback. If you are happy with our work, a short Google review would mean a lot to our team.</p>
<p>Thank you!<br>Team {{site_name}}</p>`,
  },
  {
    name: 'Service promotion – Website & App',
    category: 'promotion',
    subject: '{{first_name}}, grow your business with a modern website & app',
    preheader: 'Fast, mobile-first websites and apps built by {{site_name}}.',
    format: 'html',
    body: frame(
      hero('linear-gradient(135deg,#0b1b33,#1d6fb8)', 'Digital growth', 'Your business deserves a<br>stunning online presence', 'Websites, mobile apps &amp; software that bring you customers'),
      `<p style="margin-top:0">Hi {{first_name}},</p>
<p>Customers search online before they buy. {{site_name}} builds fast, mobile-friendly websites and apps that turn visitors into enquiries.</p>
<table width="100%" cellpadding="0" cellspacing="0"><tr>${feature('🌐', 'Websites', 'SEO-ready, responsive sites with an easy admin panel.')}${feature('📱', 'Mobile apps', 'Android &amp; iOS apps for your customers and staff.')}</tr>
<tr>${feature('⚙️', 'Custom software', 'CRM, billing, HR and ERP built for how you work.')}${feature('📈', 'Digital marketing', 'SEO, Google &amp; social media ads that deliver leads.')}</tr></table>
<p style="text-align:center">${BTN('Get a free quote', '{{site_url}}/get-quote').replace('<table ', '<table align="center" ')}</p>
<p>Or call / WhatsApp us on <b>{{our_phone}}</b>.</p>
<p>Regards,<br><b>Team {{site_name}}</b></p>`
    ),
  },
  {
    name: 'Festive greetings & offer',
    category: 'festive',
    subject: 'Festive wishes from {{site_name}} 🪔 + a special offer inside',
    preheader: 'Celebrate with a special discount on websites and apps.',
    format: 'html',
    body: frame(
      hero('linear-gradient(135deg,#7c2d12,#c2410c)', 'Season’s greetings', 'Happy Festive Season!', 'Wishing you and your family joy, health and prosperity'),
      `<p style="margin-top:0">Dear {{name}},</p>
<p>Thank you for being part of the {{site_name}} family. To celebrate the season, we are offering a <b>special festive discount</b> on new websites, mobile apps and annual maintenance plans.</p>
<div style="border:2px dashed #f7c41a;border-radius:12px;padding:18px;text-align:center;margin:20px 0;background:#fffbeb">
  <div style="font-size:13px;color:#92400e;text-transform:uppercase;letter-spacing:1px">Festive offer</div>
  <div style="font-size:30px;font-weight:800;color:#0b1b33;margin:4px 0">Up to 20% OFF</div>
  <div style="font-size:13px;color:#475569">Valid for a limited time on new orders</div>
</div>
<p style="text-align:center">${BTN('Claim the offer', '{{site_url}}/contact').replace('<table ', '<table align="center" ')}</p>
<p>Warm wishes,<br><b>Team {{site_name}}</b></p>`
    ),
  },
  {
    name: 'Announcement (designed)',
    category: 'announcement',
    subject: 'An update from {{site_name}}',
    preheader: 'Important news from {{site_name}}.',
    format: 'html',
    body: frame(
      hero('#0b1b33', 'Announcement', 'Write your headline here', 'A short line that explains the news'),
      `<p style="margin-top:0">Hi {{first_name}},</p>
<p>Write your announcement here – a new service, a new office, a product launch or a change your customers should know about.</p>
<p>Keep it short and add one clear next step.</p>
<p style="text-align:center">${BTN('Learn more', '{{site_url}}').replace('<table ', '<table align="center" ')}</p>
<p>Regards,<br><b>Team {{site_name}}</b></p>`
    ),
  },
];
