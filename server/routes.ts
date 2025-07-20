import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { db } from "./db";
import { setupAuth, requireAuth } from "./auth";
import { insertChatSchema, insertMessageSchema, insertChatMemberSchema } from "@shared/schema";
import { z } from "zod";
import { cleanupService } from "./cleanup";
import { messages } from "@shared/schema";
import { eq } from "drizzle-orm";
import fs from "fs/promises";

// File upload configuration
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|mov|avi/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

interface WebSocketClient extends WebSocket {
  userId?: number;
  chatId?: number;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);
  
  // WebSocket setup - MUST be before API routes that use broadcastToChat
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Map<string, WebSocketClient[]>();
  const onlineUsers = new Set<number>();

  function broadcastToChat(chatId: number, message: any) {
    const chatClients = clients.get(`chat_${chatId}`) || [];
    chatClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  wss.on('connection', (ws: WebSocketClient, req) => {
    console.log('A new WebSocket client connected.');

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received WebSocket message:', message);
        
        switch (message.type) {
          case 'join_chat':
            const { chatId, userId } = message.data;
            ws.userId = userId;
            ws.chatId = chatId;
            
            console.log(`User ${userId} joined chat ${chatId}`);
            
            // Mark user as online
            onlineUsers.add(userId);
            
            // Add client to chat room
            const chatKey = `chat_${chatId}`;
            if (!clients.has(chatKey)) {
              clients.set(chatKey, []);
            }
            clients.get(chatKey)!.push(ws);
            
            // Notify others that user joined
            broadcastToChat(chatId, {
              type: 'user_joined',
              data: { userId },
            });
            console.log(`Broadcasted 'user_joined' for user ${userId} in chat ${chatId}`);
            
            // Broadcast online status to all connected clients
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'user_online',
                  data: { userId }
                }));
              }
            });
            console.log(`Broadcasted 'user_online' for user ${userId} to all clients.`);
            break;

          case 'typing':
            if (ws.chatId) {
              broadcastToChat(ws.chatId, {
                type: 'typing',
                data: { userId: ws.userId, typing: message.data.typing },
              });
              console.log(`Broadcasted 'typing' status for user ${ws.userId} in chat ${ws.chatId}`);
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message processing error:', error);
      }
    });

    ws.on('close', () => {
      console.log(`WebSocket client disconnected. UserID: ${ws.userId}, ChatID: ${ws.chatId}`);
      // Remove client from all chat rooms
      if (ws.chatId) {
        const chatKey = `chat_${ws.chatId}`;
        const chatClients = clients.get(chatKey) || [];
        const index = chatClients.indexOf(ws);
        if (index > -1) {
          chatClients.splice(index, 1);
          console.log(`Removed client from chat room: ${chatKey}`);
          if (chatClients.length === 0) {
            clients.delete(chatKey);
            console.log(`Deleted empty chat room: ${chatKey}`);
          }
        }
        
        // Notify others that user left
        broadcastToChat(ws.chatId, {
          type: 'user_left',
          data: { userId: ws.userId },
        });
        console.log(`Broadcasted 'user_left' for user ${ws.userId} in chat ${ws.chatId}`);
      }
      
      // Mark user as offline if no other connections exist
      if (ws.userId) {
        const userStillOnline = Array.from(wss.clients).some(client => 
          (client as WebSocketClient).userId === ws.userId && client.readyState === WebSocket.OPEN
        );
        
        if (!userStillOnline) {
          onlineUsers.delete(ws.userId);
          console.log(`User ${ws.userId} is now offline.`);
          
          // Broadcast offline status to all connected clients
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'user_offline',
                data: { userId: ws.userId }
              }));
            }
          });
          console.log(`Broadcasted 'user_offline' for user ${ws.userId} to all clients.`);
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket client error:', error);
    });
  });

  // Auth middleware
  setupAuth(app);

  // User profile routes (auth routes are now in auth.ts)

  app.patch('/api/user/profile', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const updates = req.body;
      
      const user = await storage.updateUser(userId, updates);
      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        statusMessage: user.statusMessage,
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Chat routes
  app.get('/api/chats', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const chats = await storage.getUserChats(userId);
      
      res.json(chats);
    } catch (error) {
      console.error("Error fetching chats:", error);
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });

  app.post('/api/chats', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const chatData = insertChatSchema.parse({
        ...req.body,
        createdBy: userId,
      });

      const chat = await storage.createChat(chatData);
      
      // Add creator as admin member
      await storage.addChatMember({
        chatId: chat.id,
        userId: userId,
        isAdmin: true,
      });

      // Add other members if provided
      if (req.body.members && Array.isArray(req.body.members)) {
        for (const memberId of req.body.members) {
          await storage.addChatMember({
            chatId: chat.id,
            userId: memberId,
            isAdmin: false,
          });
        }
      }

      // Return complete chat data with members
      const completeChat = await storage.getUserChats(userId);
      const createdChat = completeChat.find(c => c.id === chat.id);
      res.json(createdChat || chat);
    } catch (error) {
      console.error("Error creating chat:", error);
      res.status(500).json({ message: "Failed to create chat" });
    }
  });

  app.get('/api/chats/:chatId/messages', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const chatId = parseInt(req.params.chatId);
      
      // Check if user is member of the chat
      const isMember = await storage.isUserInChat(chatId, userId);
      if (!isMember) {
        return res.status(403).json({ message: "Not authorized to view this chat" });
      }

      const messages = await storage.getChatMessages(chatId);
      res.json(messages.reverse()); // Return in chronological order
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post('/api/chats/:chatId/messages', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const chatId = parseInt(req.params.chatId);
      
      // Check if user is member of the chat
      const isMember = await storage.isUserInChat(chatId, userId);
      if (!isMember) {
        return res.status(403).json({ message: "Not authorized to send messages to this chat" });
      }

      const messageData = insertMessageSchema.parse({
        ...req.body,
        chatId,
        senderId: userId,
      });

      const message = await storage.createMessage(messageData);
      
      // Broadcast message to WebSocket clients
      const messageWithSender = {
        ...message,
        sender: await storage.getUser(userId),
      };
      
      broadcastToChat(chatId, {
        type: 'new_message',
        data: messageWithSender,
      });

      res.json(messageWithSender);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Delete message endpoint
  app.delete('/api/messages/:messageId', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const messageId = parseInt(req.params.messageId);
      
      // Get the message to check ownership and get media info
      const messageResult = await db.select().from(messages).where(eq(messages.id, messageId));
      const message = messageResult[0];
      
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      
      if (message.senderId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this message" });
      }

      await storage.deleteMessage(messageId, userId);
      
      // Broadcast message deletion to WebSocket clients
      if (message.chatId) {
        broadcastToChat(message.chatId, {
          type: 'message_deleted',
          data: { messageId },
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting message:", error);
      res.status(500).json({ message: "Failed to delete message" });
    }
  });

  app.delete('/api/chats/:chatId', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const chatId = parseInt(req.params.chatId);
      
      // Check if user is member of the chat
      const isMember = await storage.isUserInChat(chatId, userId);
      if (!isMember) {
        return res.status(403).json({ message: "Not authorized to delete this chat" });
      }

      // Get all messages in the chat before deletion for file cleanup
      const messages = await storage.getChatMessages(chatId);
      
      await storage.deleteChat(chatId, userId);
      
      // Clean up associated files
      for (const message of messages) {
        if (message.mediaUrl) {
          await cleanupService.cleanupMessageFiles(message.id);
        }
      }
      
      // Broadcast chat deletion to WebSocket clients
      broadcastToChat(chatId, {
        type: 'chat_deleted',
        data: { chatId },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting chat:", error);
      res.status(500).json({ message: "Failed to delete chat" });
    }
  });

  // File upload endpoint
  app.post('/api/upload', requireAuth, upload.single('file') as any, async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = req.user.id;
      const file = req.file;

      // Check user storage limit
      const canUpload = await storage.checkUserStorageLimit(userId, file.size);
      if (!canUpload) {
        // Delete the uploaded file
        await fs.unlink(file.path);
        return res.status(413).json({ 
          message: "Storage limit exceeded. You have reached your 1GB storage limit." 
        });
      }

      // Move file to user-specific directory
      const userDir = path.join(process.cwd(), 'uploads', userId.toString());
      await fs.mkdir(userDir, { recursive: true });
      
      const fileName = `${Date.now()}-${file.originalname}`;
      const newPath = path.join(userDir, fileName);
      await fs.rename(file.path, newPath);

      // Return file info
      res.json({
        url: `/uploads/${userId}/${fileName}`,
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '7d', // Cache for 7 days
    immutable: true,
  }));

  // User search endpoint
  app.get('/api/users/search', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { username } = req.query;
      
      if (!username || typeof username !== 'string') {
        return res.status(400).json({ message: "Username parameter is required" });
      }

      const users = await storage.searchUsersByUsername(username, userId);
      res.json(users);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  // Storage usage endpoint
  app.get('/api/user/storage', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const usage = await storage.getUserStorageUsage(userId);
      res.json(usage);
    } catch (error) {
      console.error("Error fetching storage usage:", error);
      res.status(500).json({ message: "Failed to fetch storage usage" });
    }
  });

  // Manual cleanup endpoint (for testing)
  app.post('/api/cleanup', requireAuth, async (req: any, res) => {
    try {
      await cleanupService.performCleanup();
      res.json({ message: "Cleanup completed" });
    } catch (error) {
      console.error("Error during cleanup:", error);
      res.status(500).json({ message: "Failed to perform cleanup" });
    }
  });

  // Polling endpoints for WebSocket fallback
  app.get('/api/messages/sync', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { lastMessageId = 0, chatId } = req.query;
      
      if (!chatId) {
        return res.status(400).json({ message: "Chat ID is required" });
      }

      // Get new messages since last sync
      const chatMessages = await storage.getChatMessages(parseInt(chatId), 50);
      const newMessages = chatMessages.filter((msg: any) => 
        msg.id > parseInt(lastMessageId) && msg.senderId !== userId
      );

      res.json(newMessages);
    } catch (error) {
      console.error("Error syncing messages:", error);
      res.status(500).json({ message: "Failed to sync messages" });
    }
  });

  app.get('/api/users/online', requireAuth, async (req: any, res) => {
    try {
      // Return currently online users from WebSocket tracking
      const onlineUserIds = Array.from(onlineUsers);
      res.json(onlineUserIds);
    } catch (error) {
      console.error("Error fetching online users:", error);
      res.status(500).json({ message: "Failed to fetch online users" });
    }
  });

  // Read receipts endpoints
  app.patch("/api/messages/:messageId/status", requireAuth, async (req: any, res) => {
    try {
      const { messageId } = req.params;
      const { status } = req.body;
      const userId = req.user?.id;

      if (!["delivered", "seen"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const message = await storage.updateMessageStatus(
        parseInt(messageId),
        status,
        userId
      );

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Broadcast status update via WebSocket
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'message_status_update',
            data: {
              messageId: parseInt(messageId),
              status,
              userId,
              timestamp: new Date().toISOString()
            }
          }));
        }
      });

      res.json(message);
    } catch (error) {
      console.error("Error updating message status:", error);
      res.status(500).json({ error: "Failed to update message status" });
    }
  });

  app.post("/api/chats/:chatId/mark-delivered", requireAuth, async (req: any, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.user?.id;

      await storage.markChatMessagesAsDelivered(parseInt(chatId), userId);

      broadcastToChat(parseInt(chatId), {
        type: 'messages_delivered',
        data: {
          chatId: parseInt(chatId),
          userId,
          timestamp: new Date().toISOString()
        }
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as delivered:", error);
      res.status(500).json({ error: "Failed to mark messages as delivered" });
    }
  });

  app.post("/api/chats/:chatId/mark-seen", requireAuth, async (req: any, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.user?.id;

      await storage.markChatMessagesAsSeen(parseInt(chatId), userId);

      broadcastToChat(parseInt(chatId), {
        type: 'messages_seen',
        data: {
          chatId: parseInt(chatId),
          userId,
          timestamp: new Date().toISOString()
        }
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as seen:", error);
      res.status(500).json({ error: "Failed to mark messages as seen" });
    }
  });

  return httpServer;
}
