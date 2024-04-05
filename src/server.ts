import express, { Application, Request, Response } from 'express';
import http, { Server } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

interface User {
  id: string;
  nickname: string;
  connected: boolean;
  partner: string | null;
  interests: string[];
}

class OmegleServer {
  private app: Application;
  private httpServer: Server;
  private io: SocketIOServer;
  private users: User[] = [];
  private waitingQueue: User[] = [];

  constructor() {
    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.io = new SocketIOServer(this.httpServer);

    this.setupRoutes();
    this.setupSocketIO();
  }

  private setupRoutes(): void {
    this.app.get('/', (req: Request, res: Response) => {
      res.send('Omegle clone API');
    });
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log('A user connected');

      const user: User = {
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

      socket.on('set_nickname', (nickname: string) => {
        user.nickname = nickname;
        console.log(`User ${user.id} set their nickname to ${user.nickname}`);
      });

      socket.on('set_interests', (interests: string[]) => {
        user.interests = interests;
        console.log(`User ${user.id} set their interests to ${user.interests.join(', ')}`);
      });

      socket.on('find_partner', () => {
        this.findPartner(user);
      });

      socket.on('message', (message: string) => {
        this.sendMessageToPartner(user, message);
      });

      socket.on('end_conversation', () => {
        this.endConversation(user);
      });
    });
  }

  private findPartner(user: User): void {
    const availableUser = this.waitingQueue.find((u) => u.partner === null && u.id !== user.id && this.hasSimilarInterests(u, user));
    if (availableUser) {
      user.partner = availableUser.id;
      availableUser.partner = user.id;
      this.removeUserFromQueue(user);
      this.removeUserFromQueue(availableUser);
      this.io.to(user.id).emit('partner_found', availableUser.id);
      this.io.to(availableUser.id).emit('partner_found', user.id);
    } else {
      this.addUserToQueue(user);
      this.io.to(user.id).emit('waiting_for_partner');
    }
  }


  private addUserToQueue(user: User): void {
    this.waitingQueue.push(user);
    console.log(`User ${user.id} added to the waiting queue. Current queue size: ${this.waitingQueue.length}`);
  }

  private removeUserFromQueue(user: User): void {
    const index = this.waitingQueue.findIndex((u) => u.id === user.id);
    if (index !== -1) {
      this.waitingQueue.splice(index, 1);
      console.log(`User ${user.id} removed from the waiting queue. Current queue size: ${this.waitingQueue.length}`);
    }
  }

  private hasSimilarInterests(user1: User, user2: User): boolean {
    const sharedInterests = user1.interests.filter((interest) => user2.interests.includes(interest));
    const interestThreshold = 2; 
    return sharedInterests.length >= interestThreshold;
  }

  private sendMessageToPartner(user: User, message: string): void {
    const partnerIndex = this.users.findIndex((u) => u.id === user.partner);
    if (partnerIndex !== -1) {
      const partner = this.users[partnerIndex];
      this.io.to(partner.id).emit('message', message);
    }
  }

  private endConversation(user: User): void {
    const partnerIndex = this.users.findIndex((u) => u.id === user.partner);
    if (partnerIndex !== -1) {
      const partner = this.users[partnerIndex];
      partner.partner = null;
      user.partner = null;
      this.io.to(partner.id).emit('conversation_ended');
      this.io.to(user.id).emit('conversation_ended');
    }
  }

  private notifyPartnerDisconnection(user: User): void {
    const partnerIndex = this.users.findIndex((u) => u.id === user.partner);
    if (partnerIndex !== -1) {
      const partner = this.users[partnerIndex];
      this.io.to(partner.id).emit('partner_disconnected');
    }
  }

  public start(port: number): void {
    this.httpServer.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  }
}

const omegleServer = new OmegleServer();
omegleServer.start(3000);