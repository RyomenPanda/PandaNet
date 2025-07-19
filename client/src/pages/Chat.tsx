import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import ContactList from "@/components/ContactList";
import ChatArea from "@/components/ChatArea";
import ProfileModal from "@/components/ProfileModal";
import GroupModal from "@/components/GroupModal";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Chat, User } from "@shared/schema";

export default function Chat() {
  const { user } = useAuth();
  const [selectedChat, setSelectedChat] = useState<(Chat & { 
    members: any[];
    lastMessage?: any;
  }) | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);

  const { data: chats, isLoading: chatsLoading } = useQuery({
    queryKey: ["/api/chats"],
    enabled: !!user,
  });

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
        chats={chats || []}
        selectedChat={selectedChat}
        onSelectChat={setSelectedChat}
        onShowProfile={() => setShowProfileModal(true)}
      />

      {/* Main Chat Area */}
      <ChatArea 
        selectedChat={selectedChat} 
        onChatDeleted={(chatId) => {
          setSelectedChat(null);
        }}
      />

      {/* Floating Action Button */}
      <Button
        onClick={() => setShowGroupModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-purple-600 hover:bg-purple-700 rounded-full shadow-lg z-40 pt-[14px] pb-[14px]"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>

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
