module.exports = {
  socketLog: {},
  internals: [],
  initialize(io) {
    this.io = io;
    io.on('connect', (socket) => {
      socket.on('bind', (path) => {
        const space = path === '' ? '0' : `0.${path}`;
        console.log(`socket bond: ${space}`); // eslint-disable-line no-console
        if (!this.socketLog[space]) this.socketLog[space] = [];
        if (this.socketLog[space].indexOf(socket) < 0) {
          this.socketLog[space].push(socket);
          socket.on('disconnect', () => {
            console.log(`socket disconnected: ${space}`); // eslint-disable-line no-console
            this.socketLog[space].slice(this.socketLog[space].indexOf(socket), 1);
          });
        } else socket.count = (socket.count || 1) + 1;
      });
      socket.on('unbind', (path) => {
        const space = path === '' ? '0' : `0.${path}`;
        console.log(`socket disbound: ${space}`); // eslint-disable-line no-console
        if (socket.count && socket.count > 1) {
          socket.count -= 1;
        } else this.socketLog[space].slice(this.socketLog[space].indexOf(socket), 1);
      });
    });
  },
  reportChanges(changes) {
    Object.keys(changes).forEach((space) => {
      const path = space === '0' ? '' : space.replace(/^0\./, '');
      (this.socketLog[space] || []).forEach(socket => socket.emit('update', path, changes[space]));
      this.internals.forEach((internal) => {
        if (internal.pattern.test(path)) internal.callback(path, changes[space]);
      });
    });
  },
  pushInternal(pattern, callback) {
    this.internals.push({ pattern, callback });
  },
};
