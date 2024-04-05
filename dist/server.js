"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
class OmegleServer {
    constructor() {
        this.users = [];
        this.waitingQueue = [];
        this.app = (0, express_1.default)();
        this.httpServer = http_1.default.createServer(this.app);
        this.io = new socket_io_1.Server(this.httpServer);
        this.setupRoutes();
        this.setupSocketIO();
    }
    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.send('Omegle clone API');
        });
    }
    setupSocketIO() {
        this.io.on('connection', (socket) => {
            console.log('A user connected');
            const user = {
                id: socket.id,
                nickname: '',
                connected: true,
                partner: null,
                interests: [],
            };
            this.users.push(user);
            socket.on('disconnect', () => {
                console.log('A user disconnected');
                user.connected = false;
                this.removeUserFromQueue(user);
                this.notifyPartnerDisconnection(user);
                this.users.splice(this.users.indexOf(user), 1);
            });
            socket.on('set_nickname', (nickname) => {
                user.nickname = nickname;
                console.log(`User ${user.id} set their nickname to ${user.nickname}`);
            });
            socket.on('set_interests', (interests) => {
                user.interests = interests;
                console.log(`User ${user.id} set their interests to ${user.interests.join(', ')}`);
            });
            socket.on('find_partner', () => {
                this.findPartner(user);
            });
            socket.on('message', (message) => {
                this.sendMessageToPartner(user, message);
            });
            socket.on('end_conversation', () => {
                this.endConversation(user);
            });
        });
    }
    findPartner(user) {
        const availableUser = this.waitingQueue.find((u) => u.partner === null && u.id !== user.id && this.hasSimilarInterests(u, user));
        if (availableUser) {
            user.partner = availableUser.id;
            availableUser.partner = user.id;
            this.removeUserFromQueue(user);
            this.removeUserFromQueue(availableUser);
            this.io.to(user.id).emit('partner_found', availableUser.id);
            this.io.to(availableUser.id).emit('partner_found', user.id);
        }
        else {
            this.addUserToQueue(user);
            this.io.to(user.id).emit('waiting_for_partner');
        }
    }
    addUserToQueue(user) {
        this.waitingQueue.push(user);
        console.log(`User ${user.id} added to the waiting queue. Current queue size: ${this.waitingQueue.length}`);
    }
    removeUserFromQueue(user) {
        const index = this.waitingQueue.findIndex((u) => u.id === user.id);
        if (index !== -1) {
            this.waitingQueue.splice(index, 1);
            console.log(`User ${user.id} removed from the waiting queue. Current queue size: ${this.waitingQueue.length}`);
        }
    }
    hasSimilarInterests(user1, user2) {
        const sharedInterests = user1.interests.filter((interest) => user2.interests.includes(interest));
        const interestThreshold = 2; // Adjust this value to set the minimum number of shared interests
        return sharedInterests.length >= interestThreshold;
    }
    sendMessageToPartner(user, message) {
        const partnerIndex = this.users.findIndex((u) => u.id === user.partner);
        if (partnerIndex !== -1) {
            const partner = this.users[partnerIndex];
            this.io.to(partner.id).emit('message', message);
        }
    }
    endConversation(user) {
        const partnerIndex = this.users.findIndex((u) => u.id === user.partner);
        if (partnerIndex !== -1) {
            const partner = this.users[partnerIndex];
            partner.partner = null;
            user.partner = null;
            this.io.to(partner.id).emit('conversation_ended');
            this.io.to(user.id).emit('conversation_ended');
        }
    }
    notifyPartnerDisconnection(user) {
        const partnerIndex = this.users.findIndex((u) => u.id === user.partner);
        if (partnerIndex !== -1) {
            const partner = this.users[partnerIndex];
            this.io.to(partner.id).emit('partner_disconnected');
        }
    }
    start(port) {
        this.httpServer.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    }
}
const omegleServer = new OmegleServer();
omegleServer.start(3000);
