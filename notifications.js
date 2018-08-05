const io = require('./io');
const db = require('./db');
const nodemailer = require('nodemailer');

const transport = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.OFFICE365_USER,
    pass: process.env.OFFICE365_PASSWORD,
  },
  tls: { ciphers: 'SSLv3' },
});

function notify(email, subject, content) {
  transport.sendMail({
    from: process.env.OFFICE365_USER,
    to: email,
    subject,
    html: content,
  });
}

function initialize() {
  io.pushInternal(/14$/, async (path, data) => {
    const match = path.match(/^(\d+).*14$/);
    if (match === null) return;
    const { email } = await db.User.findOne({
      where: { spaceId: match[1] },
      attributes: ['email'],
    });
    data.added.forEach((mail) => {
      notify(email, `DSpacenet: ${mail.user} has send you a email`, mail.content);
    });
  });
}

module.exports = { notify, initialize };
