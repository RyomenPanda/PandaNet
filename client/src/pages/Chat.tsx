import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import ContactList from "@/components/ContactList";
import ChatArea from "@/components/ChatArea";
import ProfileModal from "@/components/ProfileModal";
import GroupModal from "@/components/GroupModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { Chat, User, Message } from "@shared/schema";

interface WebSocketMessage {
  type: string;
  data: any;
}

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

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'new_message':
        const { chatId: newMessageChatId, ...newMessageData } = message.data;

        // Update the message list for the specific chat, ensuring no duplicates
        queryClient.setQueryData(
          ["/api/chats", newMessageChatId, "messages"],
          (oldMessages: any[] = []) => {
            if (oldMessages.some(msg => msg.id === newMessageData.id)) {
              return oldMessages; // Message already exists, do nothing
            }
            return [...oldMessages, newMessageData];
          }
        );
        
        // Update the lastMessage in the main chats list
        queryClient.setQueryData(
          ["/api/chats"],
          (oldChats: any[] = []) => 
            oldChats.map(chat => 
              chat.id === newMessageChatId
                ? { ...chat, lastMessage: newMessageData }
                : chat
            )
        );
        
        // If the new message has media, update storage usage
        if (newMessageData.mediaUrl) {
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
        const { chatId: statusUpdateChatId, messageId, status } = message.data;
        
        // Update message status in the specific chat's cache
        queryClient.setQueryData(
          ["/api/chats", statusUpdateChatId, "messages"],
          (oldMessages: any[] = []) => 
            oldMessages.map(msg => 
              msg.id === messageId 
                ? { ...msg, status: status }
                : msg
            )
        );
        break;
        
      case 'messages_delivered':
      case 'messages_seen':
        const { chatId: updateChatId } = message.data;
        const newStatus = message.type === 'messages_seen' ? 'seen' : 'delivered';

        queryClient.setQueryData(
          ["/api/chats", updateChatId, "messages"],
          (oldMessages: (Message & { sender: User })[] = []) =>
            oldMessages.map(msg => {
              // Only update messages that are not our own and have a lower status
              if (msg.senderId !== user?.id) {
                const currentStatus = msg.status || 'sent';
                if (newStatus === 'seen' && (currentStatus === 'sent' || currentStatus === 'delivered')) {
                  return { ...msg, status: 'seen' };
                }
                if (newStatus === 'delivered' && currentStatus === 'sent') {
                  return { ...msg, status: 'delivered' };
                }
              }
              return msg;
            })
        );
        break;
        
      case 'message_deleted':
        const { chatId: deletedMessageChatId } = message.data;
        queryClient.invalidateQueries({ queryKey: ["/api/chats", deletedMessageChatId, "messages"] });
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
    }
  }, [queryClient, user]);

  // Update the WebSocket message handler to include typing events and polling fallback
  const { sendMessage: sendWsMessage, isConnected: wsConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
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
