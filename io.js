module.exports = {
  socketLog: {},
  initialize(io) {
    this.io = io;
    io.on('connect', (socket) => {
      socket.on('bind', (path) => {
        const space = path === '' ? '0' : `0.${path}`;
        console.log(`socket bond: ${space}`);
        if (!this.socketLog[space]) this.socketLog[space] = [];
        this.socketLog[space].push(socket);
        socket.on('disconnect', () => {
          console.log(`socket disconnected: ${space}`);
          this.socketLog[space].slice(this.socketLog[space].indexOf(socket), 1);
        });
      });
      socket.on('unbind', (path) => {
        const space = path === '' ? '0' : `0.${path}`;
        console.log(`socket disbound: ${space}`);
        this.socketLog[space].slice(this.socketLog[space].indexOf(socket), 1);
      });
    });
  },
  reportChanges(changes) {
    Object.keys(changes).forEach((space) => {
      const path = space === '0' ? '' : space.replace(/^0\./, '');
      (this.socketLog[space] || []).forEach(socket => socket.emit('update', path, changes[space]));
    });
  },
};
