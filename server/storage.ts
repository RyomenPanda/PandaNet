import {
  users,
  chats,
  messages,
  chatMembers,
  type User,
  type InsertUser,
  type Chat,
  type InsertChat,
  type Message,
  type InsertMessage,
  type ChatMember,
  type InsertChatMember,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, or, ne, sql, lt } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  
  // Chat operations
  createChat(chat: InsertChat): Promise<Chat>;
  getChat(id: number): Promise<Chat | undefined>;
  getUserChats(userId: number): Promise<(Chat & { 
    members: (ChatMember & { user: User })[];
    lastMessage?: Message & { sender: User };
  })[]>;
  
  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getChatMessages(chatId: number, limit?: number): Promise<(Message & { sender: User })[]>;
  updateMessageStatus(messageId: number, status: string, userId: number): Promise<Message | undefined>;
  markChatMessagesAsDelivered(chatId: number, userId: number): Promise<void>;
  markChatMessagesAsSeen(chatId: number, userId: number): Promise<void>;
  deleteMessage(messageId: number, userId: number): Promise<void>;
  
  // Chat member operations
  addChatMember(member: InsertChatMember): Promise<ChatMember>;
  removeChatMember(chatId: number, userId: number): Promise<void>;
  getChatMembers(chatId: number): Promise<(ChatMember & { user: User })[]>;
  isUserInChat(chatId: number, userId: number): Promise<boolean>;
  deleteChat(chatId: number, userId: number): Promise<void>;
  searchUsersByUsername(username: string, excludeUserId: number): Promise<User[]>;
  
  // File cleanup operations
  cleanupExpiredFiles(): Promise<void>;
  deleteUserFiles(userId: number): Promise<void>;
  deleteMessageFiles(messageId: number): Promise<void>;
  deleteChatFiles(chatId: number): Promise<void>;
  getFilesToCleanup(): Promise<string[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Chat operations
  async createChat(chat: InsertChat): Promise<Chat> {
    const [newChat] = await db.insert(chats).values(chat).returning();
    return newChat;
  }

  async getChat(id: number): Promise<Chat | undefined> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, id));
    return chat;
  }

  async getUserChats(userId: number): Promise<(Chat & { 
    members: (ChatMember & { user: User })[];
    lastMessage?: Message & { sender: User };
  })[]> {
    // First, get all chats where the user is a member
    const userChatsQuery = await db
      .select({
        chat: chats,
      })
      .from(chatMembers)
      .innerJoin(chats, eq(chatMembers.chatId, chats.id))
      .where(eq(chatMembers.userId, userId))
      .orderBy(desc(chats.updatedAt));

    const chatMap = new Map<number, Chat & { 
      members: (ChatMember & { user: User })[];
      lastMessage?: Message & { sender: User };
    }>();

    // Initialize chat map with chat data
    for (const row of userChatsQuery) {
      chatMap.set(row.chat.id, {
        ...row.chat,
        members: [],
      });
    }

    // Now get ALL members for each chat
    for (const [chatId, chatData] of Array.from(chatMap.entries())) {
      const chatMembersQuery = await db
        .select({
          member: chatMembers,
          memberUser: users,
        })
        .from(chatMembers)
        .leftJoin(users, eq(chatMembers.userId, users.id))
        .where(eq(chatMembers.chatId, chatId));

      for (const row of chatMembersQuery) {
        if (row.member && row.memberUser) {
          chatData.members.push({
            ...row.member,
            user: row.memberUser,
          });
        }
      }
    }

    // Get last messages for each chat
    for (const [chatId, chatData] of Array.from(chatMap.entries())) {
      const [lastMessage] = await db
        .select({
          message: messages,
          sender: users,
        })
        .from(messages)
        .leftJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.chatId, chatId))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      if (lastMessage && lastMessage.sender) {
        chatData.lastMessage = {
          ...lastMessage.message,
          sender: lastMessage.sender,
        };
      }
    }

    return Array.from(chatMap.values());
  }

  // Message operations
  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  async getChatMessages(chatId: number, limit = 50): Promise<(Message & { sender: User })[]> {
    const messagesQuery = await db
      .select({
        message: messages,
        sender: users,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return messagesQuery
      .map(row => row.sender ? { ...row.message, sender: row.sender } : null)
      .filter(Boolean) as (Message & { sender: User })[];
  }

  async updateMessageStatus(messageId: number, status: string, userId: number): Promise<Message | undefined> {
    const updateFields: any = { status };
    if (status === "delivered") {
      updateFields.deliveredAt = new Date();
    } else if (status === "seen") {
      updateFields.seenAt = new Date();
    }

    const [updatedMessage] = await db
      .update(messages)
      .set(updateFields)
      .where(eq(messages.id, messageId))
      .returning();

    return updatedMessage;
  }

  async markChatMessagesAsDelivered(chatId: number, userId: number): Promise<void> {
    // Mark all undelivered messages in the chat as delivered (except sender's own messages)
    await db
      .update(messages)
      .set({ 
        status: "delivered",
        deliveredAt: new Date() 
      })
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.status, "sent"),
          ne(messages.senderId, userId) // Don't update sender's own messages
        )
      );
  }

  async markChatMessagesAsSeen(chatId: number, userId: number): Promise<void> {
    // Mark all delivered messages in the chat as seen (except sender's own messages)
    await db
      .update(messages)
      .set({ 
        status: "seen",
        seenAt: new Date() 
      })
      .where(
        and(
          eq(messages.chatId, chatId),
          or(eq(messages.status, "sent"), eq(messages.status, "delivered")),
          ne(messages.senderId, userId) // Don't update sender's own messages
        )
      );
  }

  async deleteMessage(messageId: number, userId: number): Promise<void> {
    // Delete the message itself
    await db.delete(messages).where(eq(messages.id, messageId));

    // Delete associated files
    await this.deleteMessageFiles(messageId);
  }

  // Chat member operations
  async addChatMember(member: InsertChatMember): Promise<ChatMember> {
    const [newMember] = await db.insert(chatMembers).values(member).returning();
    return newMember;
  }

  async removeChatMember(chatId: number, userId: number): Promise<void> {
    await db
      .delete(chatMembers)
      .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)));
  }

  async getChatMembers(chatId: number): Promise<(ChatMember & { user: User })[]> {
    const membersQuery = await db
      .select({
        member: chatMembers,
        user: users,
      })
      .from(chatMembers)
      .leftJoin(users, eq(chatMembers.userId, users.id))
      .where(eq(chatMembers.chatId, chatId));

    return membersQuery
      .map(row => row.user ? { ...row.member, user: row.user } : null)
      .filter(Boolean) as (ChatMember & { user: User })[];
  }

  async isUserInChat(chatId: number, userId: number): Promise<boolean> {
    const [member] = await db
      .select()
      .from(chatMembers)
      .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)));
    return !!member;
  }

  async deleteChat(chatId: number, userId: number): Promise<void> {
    // Delete all messages in the chat
    await db.delete(messages).where(eq(messages.chatId, chatId));
    
    // Delete all chat members
    await db.delete(chatMembers).where(eq(chatMembers.chatId, chatId));
    
    // Delete the chat itself
    await db.delete(chats).where(eq(chats.id, chatId));

    // Delete associated files
    await this.deleteChatFiles(chatId);
  }

  async searchUsersByUsername(username: string, excludeUserId: number): Promise<User[]> {
    const result = await db.select()
      .from(users)
      .where(
        and(
          sql`${users.username} ILIKE ${'%' + username + '%'}`,
          ne(users.id, excludeUserId)
        )
      );
    return result;
  }

  // File cleanup operations
  async cleanupExpiredFiles(): Promise<void> {
    const filesToCleanup = await this.getFilesToCleanup();
    for (const filePath of filesToCleanup) {
      try {
        await fs.unlink(filePath);
        console.log(`Deleted expired file: ${filePath}`);
      } catch (error) {
        console.error(`Error deleting expired file ${filePath}:`, error);
      }
    }
  }

  async deleteUserFiles(userId: number): Promise<void> {
    const userDir = path.join(process.cwd(), "uploads", userId.toString());
    try {
      await fs.rm(userDir, { recursive: true, force: true });
      console.log(`Deleted user files for user ${userId}: ${userDir}`);
    } catch (error) {
      console.error(`Error deleting user files for user ${userId}:`, error);
    }
  }

  async deleteMessageFiles(messageId: number): Promise<void> {
    const [message] = await db.select().from(messages).where(eq(messages.id, messageId));
    if (!message) {
      console.warn(`Message with ID ${messageId} not found for file cleanup.`);
      return;
    }

    if (message.mediaUrl) {
      const fileName = path.basename(message.mediaUrl);
      const filePath = path.join(process.cwd(), "uploads", fileName);
      try {
        await fs.unlink(filePath);
        console.log(`Deleted message file for message ${messageId}: ${filePath}`);
      } catch (error) {
        console.error(`Error deleting message file for message ${messageId}:`, error);
      }
    }
  }

  async deleteChatFiles(chatId: number): Promise<void> {
    const chat = await db.select().from(chats).where(eq(chats.id, chatId));
    if (!chat || !chat[0]) {
      console.warn(`Chat with ID ${chatId} not found for file cleanup.`);
      return;
    }

    const chatDir = path.join(process.cwd(), "uploads", chat[0].id.toString());
    try {
      await fs.rm(chatDir, { recursive: true, force: true });
      console.log(`Deleted chat files for chat ${chatId}: ${chatDir}`);
    } catch (error) {
      console.error(`Error deleting chat files for chat ${chatId}:`, error);
    }
  }

  async getFilesToCleanup(): Promise<string[]> {
    const files: string[] = [];
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get all messages with media that are older than 7 days
    const messagesToCleanup = await db
      .select()
      .from(messages)
      .where(
        and(
          lt(messages.createdAt, oneWeekAgo),
          sql`${messages.mediaUrl} IS NOT NULL`
        )
      );

    for (const message of messagesToCleanup) {
      if (message.mediaUrl) {
        const fileName = path.basename(message.mediaUrl);
        files.push(path.join(process.cwd(), "uploads", fileName));
      }
    }

    return files;
  }
}

export const storage = new DatabaseStorage();
