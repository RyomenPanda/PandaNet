import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import ContactList from "@/components/ContactList";
import ChatArea from "@/components/ChatArea";
import ProfileModal from "@/components/ProfileModal";
import GroupModal from "@/components/GroupModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { Chat, User } from "@shared/schema";

export default function Chat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  // Add typing users state
  const [typingUsers, setTypingUsers] = useState<Set<number>>(new Set());

  const { data: chats, isLoading: chatsLoading } = useQuery({
    queryKey: ["/api/chats"],
    enabled: !!user,
  });

  // Update the WebSocket message handler to include typing events and polling fallback
  const { sendMessage: sendWsMessage, isConnected: wsConnected } = useWebSocket({
    enablePolling: true,
    pollingInterval: 3000,
    onMessage: (message) => {
      switch (message.type) {
        case 'new_message':
          // Update messages in the current chat
          queryClient.setQueryData(
            ["/api/chats", selectedChat?.id, "messages"],
            (oldMessages: any[] = []) => [...oldMessages, message.data]
          );
          
          // Update the lastMessage in the chats query cache
          queryClient.setQueryData(
            ["/api/chats"],
            (oldChats: any[] = []) => 
              oldChats.map(chat => 
                chat.id === message.data.chatId 
                  ? { ...chat, lastMessage: message.data }
                  : chat
              )
          );
          
          // If the new message has media, update storage usage
          if (message.data.mediaUrl) {
            queryClient.invalidateQueries({ queryKey: ["/api/user/storage"] });
          }
          break;
          
        case 'typing':
          if (message.data.userId !== user?.id) {
            setTypingUsers(prev => {
              const newSet = new Set(prev);
              if (message.data.typing) {
                newSet.add(message.data.userId);
              } else {
                newSet.delete(message.data.userId);
              }
              return newSet;
            });
          }
          break;
          
        case 'message_status_update':
          // Update message status in cache
          queryClient.setQueryData(
            ["/api/chats", selectedChat?.id, "messages"],
            (oldMessages: any[] = []) => 
              oldMessages.map(msg => 
                msg.id === message.data.messageId 
                  ? { ...msg, status: message.data.status }
                  : msg
              )
          );
          break;
          
        case 'messages_delivered':
        case 'messages_seen':
          // Refresh messages to get updated statuses
          queryClient.invalidateQueries({
            queryKey: ["/api/chats", selectedChat?.id, "messages"]
          });
          break;
          
        case 'message_deleted':
          // Update storage usage when message is deleted
          queryClient.invalidateQueries({ queryKey: ["/api/user/storage"] });
          break;
          
        case 'chat_deleted':
          // Update storage usage when chat is deleted
          queryClient.invalidateQueries({ queryKey: ["/api/user/storage"] });
          break;
          
        case 'user_online':
          setOnlineUsers(prev => new Set(Array.from(prev).concat(message.data.userId)));
          break;
          
        case 'user_offline':
          setOnlineUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(message.data.userId);
            return newSet;
          });
          break;
          
        case 'online_users_update':
          // Update online users from polling
          setOnlineUsers(new Set(message.data.onlineUsers));
          break;
      }
    },
  });

  // Join chat when selected
  useEffect(() => {
    if (selectedChat && user) {
      sendWsMessage({
        type: 'join_chat',
        data: { chatId: selectedChat.id, userId: user.id },
      });
    }
  }, [selectedChat, user, sendWsMessage]);

  // Additional interval-based sync for messages (fallback)
  useEffect(() => {
    if (!selectedChat || wsConnected) return; // Only poll if WebSocket is not connected

    const syncInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/messages/sync?chatId=${selectedChat.id}&lastMessageId=0`, {
          credentials: 'include'
        });
        if (response.ok) {
          const newMessages = await response.json();
          if (newMessages.length > 0) {
            // Update messages in cache
            queryClient.setQueryData(
              ["/api/chats", selectedChat.id, "messages"],
              (oldMessages: any[] = []) => {
                const updatedMessages = [...oldMessages];
                newMessages.forEach((newMessage: any) => {
                  const existingIndex = updatedMessages.findIndex(m => m.id === newMessage.id);
                  if (existingIndex === -1) {
                    updatedMessages.unshift(newMessage);
                  }
                });
                return updatedMessages;
              }
            );
          }
        }
      } catch (error) {
        console.error('Message sync error:', error);
      }
    }, 3000); // Sync every 3 seconds as fallback

    return () => clearInterval(syncInterval);
  }, [selectedChat, queryClient, wsConnected]);

  // Interval-based sync for online status (fallback)
  useEffect(() => {
    if (wsConnected) return; // Only poll if WebSocket is not connected

    const onlineSyncInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/users/online', {
          credentials: 'include'
        });
        if (response.ok) {
          const onlineUserIds = await response.json();
          setOnlineUsers(new Set(onlineUserIds));
        }
      } catch (error) {
        console.error('Failed to sync online status:', error);
      }
    }, 10000); // Sync every 10 seconds

    return () => clearInterval(onlineSyncInterval);
  }, [wsConnected]);

  if (chatsLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen bg-black text-white">
      {/* Contact List Sidebar */}
      <ContactList
        chats={(chats as any) || []}
        selectedChat={selectedChat}
        onSelectChat={(chat) => setSelectedChat(chat as any)}
        onShowProfile={() => setShowProfileModal(true)}
        onlineUsers={onlineUsers}
      />

      {/* Main Chat Area */}
      <ChatArea 
        selectedChat={selectedChat as any} 
        onChatDeleted={(chatId) => {
          setSelectedChat(null);
        }}
        sendWsMessage={sendWsMessage}
        onlineUsers={onlineUsers}
        typingUsers={typingUsers}
      />

      {/* Modals */}
      <ProfileModal 
        open={showProfileModal} 
        onOpenChange={setShowProfileModal} 
      />
      <GroupModal 
        open={showGroupModal} 
        onOpenChange={setShowGroupModal} 
      />
    </div>
  );
}
