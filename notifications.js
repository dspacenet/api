const io = require('./io');
const db = require('./db');
const sccpClient = require('./sccpClient');
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
  io.pushInternal(/12$/, async (path, data) => {
    if (data.added.some(post => post.content === 'dump')) {
      const match = path.match(/^(\d+).*12$/);
      if (match === null) return;
      const { lastClock, email } = await db.User.findOne({
        where: { spaceId: match[1] },
        attributes: ['lastClock', 'email'],
      });
      const pendingNotifications = (await sccpClient.getSpace(path))
        .filter(post => post.pid > lastClock && post.content !== 'dump');
      if (pendingNotifications.length > 0) {
        const content = pendingNotifications.map(post => `<strong>${post.user}:</strong> ${post.content}`).join('<br />');
        notify(email, 'You have new notifications', content);
      }
      await db.User.update({ lastClock: sccpClient.getTime() }, { where: { spaceId: match[1] } });
    }
  });
}

module.exports = { notify, initialize };
