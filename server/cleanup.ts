import { storage } from "./storage";
import fs from "fs/promises";
import path from "path";

export class FileCleanupService {
  private static instance: FileCleanupService;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly FILE_EXPIRY_DAYS = 7;

  private constructor() {}

  static getInstance(): FileCleanupService {
    if (!FileCleanupService.instance) {
      FileCleanupService.instance = new FileCleanupService();
    }
    return FileCleanupService.instance;
  }

  async startCleanupService(): Promise<void> {
    console.log("Starting file cleanup service...");
    
    // Run initial cleanup
    await this.performCleanup();
    
    // Schedule regular cleanup
    this.cleanupInterval = setInterval(async () => {
      await this.performCleanup();
    }, this.CLEANUP_INTERVAL);
  }

  async stopCleanupService(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log("File cleanup service stopped.");
    }
  }

  async performCleanup(): Promise<void> {
    try {
      console.log("Performing file cleanup...");
      
      const uploadsDir = path.join(process.cwd(), "uploads");
      
      // Check if uploads directory exists
      try {
        await fs.access(uploadsDir);
      } catch {
        console.log("Uploads directory does not exist, skipping cleanup.");
        return;
      }

      const files = await fs.readdir(uploadsDir);
      const now = new Date();
      const expiryTime = now.getTime() - (this.FILE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      let deletedCount = 0;
      let errorCount = 0;

      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          
          // Check if file is older than expiry time
          if (stats.mtime.getTime() < expiryTime) {
            await fs.unlink(filePath);
            console.log(`Deleted expired file: ${file}`);
            deletedCount++;
          }
        } catch (error) {
          console.error(`Error processing file ${file}:`, error);
          errorCount++;
        }
      }

      console.log(`Cleanup completed: ${deletedCount} files deleted, ${errorCount} errors`);
    } catch (error) {
      console.error("Error during file cleanup:", error);
    }
  }

  async cleanupSpecificFile(fileName: string): Promise<void> {
    try {
      const filePath = path.join(process.cwd(), "uploads", fileName);
      await fs.unlink(filePath);
      console.log(`Deleted specific file: ${fileName}`);
    } catch (error) {
      console.error(`Error deleting file ${fileName}:`, error);
    }
  }

  async cleanupUserFiles(userId: number): Promise<void> {
    await storage.deleteUserFiles(userId);
  }

  async cleanupMessageFiles(messageId: number): Promise<void> {
    await storage.deleteMessageFiles(messageId);
  }

  async cleanupChatFiles(chatId: number): Promise<void> {
    await storage.deleteChatFiles(chatId);
  }
}

export const cleanupService = FileCleanupService.getInstance(); 