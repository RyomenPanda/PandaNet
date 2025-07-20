import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PandaLogo from "./PandaLogo";
import { useAuth } from "@/hooks/useAuth";
import { Search, Settings, MoreVertical, Users, HardDrive, Plus } from "lucide-react";
import type { Chat, User } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/useWebSocket";
import StorageModal from "./StorageModal";
import GroupModal from "./GroupModal";
import { Progress } from "@/components/ui/progress";

interface ContactListProps {
  chats: (Chat & { 
    members: any[];
    lastMessage?: any;
  })[];
  selectedChat: Chat | null;
  onSelectChat: (chat: Chat) => void;
  onShowProfile: () => void;
  onlineUsers: Set<number>; // Add this prop
}

export default function ContactList({ 
  chats, 
  selectedChat, 
  onSelectChat, 
  onShowProfile,
  onlineUsers // Add this prop
}: ContactListProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);

  // Get storage usage for header indicator
  const { data: storageData } = useQuery({
    queryKey: ["/api/user/storage"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/user/storage");
      return response.json();
    },
  });

  // Listen for WebSocket messages to update chat list
  // The ContactList should only receive onlineUsers as a prop and use it

  // Find userIds already in chats (for 1:1 chats)
  const chatUserIds = new Set(
    chats
      .filter(chat => !chat.isGroup)
      .map(chat => chat.members.find(m => m.userId !== user?.id)?.user.id)
      .filter(Boolean)
  );

  // User search query (only if searchTerm is present and no chat matches)
  const shouldSearchUsers = !!searchTerm &&
    !chats.some(chat => {
      if (chat.isGroup) {
        return chat.name?.toLowerCase().includes(searchTerm.toLowerCase());
      } else {
        const otherUser = chat.members.find(m => m.userId !== user?.id)?.user;
        return (
          otherUser?.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          otherUser?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          otherUser?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          otherUser?.username?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
    });

  const {
    data: foundUsers,
    isLoading: isUserSearchLoading,
    isError: isUserSearchError,
  } = useQuery({
    queryKey: ["/api/users/search", searchTerm],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/search?username=${encodeURIComponent(searchTerm)}`);
      return res.json();
    },
    enabled: shouldSearchUsers,
  });

  const startChatMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", "/api/chats", {
        isGroup: false,
        members: [userId],
      });
      return res.json();
    },
    onSuccess: () => {
      // Invalidate chats query to refresh the list with complete data
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
    },
  });

  // Type guard to check if chat has members
  function hasMembers(chat: any): chat is Chat & { members: any[] } {
    return Array.isArray(chat.members);
  }

  const filteredChats = chats.filter(chat => {
    if (!searchTerm) return true;
    if (chat.isGroup) {
      return chat.name?.toLowerCase().includes(searchTerm.toLowerCase());
    } else {
      const otherUser = chat.members.find(m => m.userId !== user?.id)?.user;
      return (
        otherUser?.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        otherUser?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        otherUser?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        otherUser?.username?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
  });

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStorageUsagePercentage = (): number => {
    if (!storageData) return 0;
    return Math.round((storageData.used / storageData.limit) * 100);
  };

  const getChatDisplayName = (chat: Chat | (Chat & { members: any[] })) => {
    if (chat.isGroup) {
      return chat.name || "Group Chat";
    } else if (hasMembers(chat)) {
      const otherUser = chat.members.find((m: any) => m.userId !== user?.id)?.user;
      return (
        otherUser?.displayName ||
        `${otherUser?.firstName || ''} ${otherUser?.lastName || ''}`.trim() ||
        "Unknown User"
      );
    } else {
      return "Unknown User";
    }
  };

  const getChatAvatar = (chat: Chat | (Chat & { members: any[] })) => {
    if (chat.isGroup) {
      return null; // Will show Users icon
    } else if (hasMembers(chat)) {
      const otherUser = chat.members.find((m: any) => m.userId !== user?.id)?.user;
      return otherUser?.profileImageUrl;
    } else {
      return undefined;
    }
  };

  // Add this function to check if a user is online
  const isUserOnline = (chat: any) => {
    if (chat.isGroup) return false;
    const otherUser = chat.members.find((m: any) => m.userId !== user?.id)?.user;
    return otherUser ? onlineUsers.has(otherUser.id) : false;
  };

  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
                  <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <PandaLogo size="md" />
              <h2 className="text-xl font-bold">PandaNet</h2>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-gray-400 hover:text-white hover:bg-gray-700"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700 text-white">
                <DropdownMenuItem 
                  onClick={() => setShowStorageModal(true)}
                  className="hover:bg-gray-700 cursor-pointer"
                >
                  <HardDrive className="h-4 w-4 mr-2" />
                  Check Storage
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setShowGroupModal(true)}
                  className="hover:bg-gray-700 cursor-pointer"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* Storage Usage Indicator */}
          {storageData && (
            <div className="mb-3 p-2 bg-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Storage</span>
                <span className="text-xs text-gray-300">
                  {formatBytes(storageData.used)} / {formatBytes(storageData.limit)}
                </span>
              </div>
              <Progress 
                value={getStorageUsagePercentage()} 
                className="h-1.5 bg-gray-600"
              />
            </div>
          )}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-black border-gray-600 focus:border-purple-600 text-white placeholder-gray-400"
          />
        </div>
      </div>

      {/* Contact List */}
      <ScrollArea className="flex-1">
        <div className="space-y-1">
          {filteredChats.map((chat: any) => {
            const isSelected = selectedChat?.id === chat.id;
            const avatarUrl = getChatAvatar(chat);
            const displayName = getChatDisplayName(chat);
            const lastMessage = chat.lastMessage;
            const isOnline = isUserOnline(chat);
            
            return (
              <div
                key={chat.id}
                onClick={() => {
                  // Prevent selecting the same chat if it's already selected
                  if (selectedChat?.id !== chat.id) {
                    onSelectChat(chat);
                  }
                }}
                className={`p-4 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-purple-600 bg-opacity-20 border-l-4 border-purple-600'
                    : 'hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    {chat.isGroup ? (
                      <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center">
                        <Users className="h-6 w-6 text-white" />
                      </div>
                    ) : (
                      <Avatar className="w-12 h-12 border-2 border-purple-600">
                        <AvatarImage src={avatarUrl || undefined} />
                        <AvatarFallback className="bg-gray-600 text-white">
                          {displayName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {/* Online status indicator */}
                    {!chat.isGroup && (
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-800 ${
                        isOnline ? 'bg-green-500' : 'bg-gray-500'
                      }`} />
                    )}
                    {chat.isGroup && (
                      <div className="absolute -top-1 -right-1 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-xs font-bold">{chat.members.length}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold truncate">{displayName}</h3>
                      {lastMessage && (
                        <span className="text-sm text-gray-400">
                          {formatTime(lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 truncate">
                      {lastMessage 
                        ? (lastMessage.messageType === 'text' 
                          ? lastMessage.content 
                          : `📎 ${lastMessage.mediaName || 'File'}`)
                        : 'No messages yet'
                      }
                    </p>
                          </div>
      </div>

      {/* Storage Modal */}
      <StorageModal 
        open={showStorageModal} 
        onOpenChange={setShowStorageModal} 
      />

      {/* Group Modal */}
      <GroupModal 
        open={showGroupModal} 
        onOpenChange={setShowGroupModal} 
      />
    </div>
  );
})}

          {/* User search results (if no chat matches) */}
          {shouldSearchUsers && (
            <div className="p-4 border-t border-gray-700 mt-2">
              {isUserSearchLoading && (
                <div className="text-gray-400">Searching users...</div>
              )}
              {isUserSearchError && (
                <div className="text-red-400">Error searching users.</div>
              )}
              {foundUsers && foundUsers.length === 0 && !isUserSearchLoading && (
                <div className="text-gray-400">No users found.</div>
              )}
              {foundUsers && foundUsers.length > 0 && (
                <div className="space-y-2">
                  {foundUsers.filter((u: any) => !chatUserIds.has(u.id)).map((userResult: any) => (
                    <div key={userResult.id} className="flex items-center justify-between bg-gray-700 rounded-lg p-2">
                      <div className="flex items-center space-x-3">
                        <Avatar className="w-10 h-10 border-2 border-purple-600">
                          <AvatarImage src={userResult.profileImageUrl || undefined} />
                          <AvatarFallback className="bg-gray-600 text-white">
                            {userResult.username.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-semibold">{userResult.username}</div>
                          <div className="text-xs text-gray-400">{userResult.displayName || userResult.firstName || userResult.lastName}</div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700"
                        disabled={startChatMutation.isPending}
                        onClick={async () => {
                          const chat = await startChatMutation.mutateAsync(userResult.id);
                          onSelectChat(chat);
                        }}
                      >
                        {startChatMutation.isPending ? "Starting..." : "Start Chat"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Bottom User Section */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center space-x-3">
          <Avatar className="w-10 h-10 border-2 border-purple-600">
            <AvatarImage src={user?.profileImageUrl || undefined} />
            <AvatarFallback className="bg-gray-600 text-white">
              {user?.displayName?.charAt(0) || user?.firstName?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h4 className="font-semibold">
              {user?.displayName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'You'}
            </h4>
            <p className="text-sm text-gray-400">{user?.statusMessage || 'Hey there! I\'m using PandaNet'}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onShowProfile}
            className="text-gray-400 hover:text-white hover:bg-gray-700"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
