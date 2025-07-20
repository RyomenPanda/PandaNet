import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Paperclip, Smile, Send } from "lucide-react";

interface MessageInputProps {
  chatId: number;
  onTyping?: (isTyping: boolean) => void;
}

export default function MessageInput({ chatId, onTyping }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: any) => {
      const response = await apiRequest("POST", `/api/chats/${chatId}/messages`, messageData);
      return response.json();
    },
    onSuccess: (newMessage) => {
      // Optimistically update the message list
      queryClient.setQueryData(
        ["/api/chats", chatId, "messages"],
        (oldMessages: any[] = []) => [...oldMessages, newMessage]
      );
      
      // Update the lastMessage in the main chats list
      queryClient.setQueryData(
        ["/api/chats"],
        (oldChats: any[] = []) => 
          oldChats.map(chat => 
            chat.id === chatId 
              ? { ...chat, lastMessage: newMessage }
              : chat
          )
      );

      setMessage("");
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (fileData) => {
      // Send message with file
      const messageType = fileData.type.startsWith('image/') ? 'image' : 
                         fileData.type.startsWith('video/') ? 'video' : 'document';
      
      sendMessageMutation.mutate({
        content: '',
        messageType,
        mediaUrl: fileData.url,
        mediaName: fileData.name,
        mediaSize: fileData.size,
      });
      
      // We don't need to invalidate the messages query here anymore.
      // The storage query invalidation is still useful for real-time usage updates.
      queryClient.invalidateQueries({ queryKey: ["/api/user/storage"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      
      // Check if it's a storage limit error
      if (error.message?.includes('Storage limit exceeded')) {
        toast({
          title: "Storage Limit Exceeded",
          description: "You have reached your 1GB storage limit. Please delete some files to free up space.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Error",
        description: "Failed to upload file",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    sendMessageMutation.mutate({
      content: trimmedMessage,
      messageType: 'text',
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    
    // Handle typing indicator
    if (!isTyping && onTyping) {
      setIsTyping(true);
      onTyping(true);
    }
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      onTyping?.(false);
    }, 1000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 10MB",
        variant: "destructive",
      });
      return;
    }

    uploadFileMutation.mutate(file);
  };

  return (
    <div className="p-4 border-t border-gray-700 bg-gray-800">
      <div className="flex items-center space-x-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          className="text-gray-400 hover:text-white hover:bg-gray-700"
          disabled={uploadFileMutation.isPending}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx"
          onChange={handleFileSelect}
        />
        
        <div className="flex-1 relative">
          <Input
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            className="pr-12 bg-black border-gray-600 focus:border-purple-600 text-white placeholder-gray-400 rounded-full"
            disabled={sendMessageMutation.isPending}
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-purple-600"
          >
            <Smile className="h-4 w-4" />
          </Button>
        </div>
        
        <Button
          onClick={handleSendMessage}
          disabled={!message.trim() || sendMessageMutation.isPending}
          className="bg-purple-600 hover:bg-purple-700 rounded-full p-3"
          size="icon"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      
      {uploadFileMutation.isPending && (
        <div className="mt-2 text-sm text-gray-400">
          Uploading file...
        </div>
      )}
    </div>
  );
}
