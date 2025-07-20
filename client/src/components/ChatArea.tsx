import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import MessageInput from "./MessageInput";
import { ReadReceipts } from "./ReadReceipts";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MoreVertical, Users, Trash2, MoreHorizontal } from "lucide-react";
import type { Chat, Message, User } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import ProfilePreview from "./ProfilePreview";

interface ChatAreaProps {
  selectedChat: (Chat & { 
    members: any[];
    lastMessage?: any;
  }) | null;
  onChatDeleted?: (chatId: number) => void;
  sendWsMessage: (message: any) => void; // Add this prop
  onlineUsers: Set<number>; // Add this prop
  typingUsers: Set<number>; // Add this prop
}

export default function ChatArea({ 
  selectedChat, 
  onChatDeleted,
  sendWsMessage,
  onlineUsers,
  typingUsers
}: ChatAreaProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);

  // Use selectedChat directly since it already contains member data from ContactList
  const chatWithMembers = selectedChat;

  const { data: messages = [], isLoading } = useQuery<(Message & { sender: User })[]>({
    queryKey: ["/api/chats", chatWithMembers?.id, "messages"],
    enabled: !!chatWithMembers,
  });

  // Delete chat mutation
  const deleteChatMutation = useMutation({
    mutationFn: async (chatId: number) => {
      await apiRequest("DELETE", `/api/chats/${chatId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      // Invalidate storage query to update usage when chat with files is deleted
      queryClient.invalidateQueries({ queryKey: ["/api/user/storage"] });
      onChatDeleted?.(chatWithMembers!.id);
      toast({
        title: "Chat deleted",
        description: "The chat has been deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete chat",
        variant: "destructive",
      });
    },
  });

  // Delete message mutation
  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await apiRequest("DELETE", `/api/messages/${messageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats", chatWithMembers?.id, "messages"] });
      // Invalidate storage query to update usage when message with file is deleted
      queryClient.invalidateQueries({ queryKey: ["/api/user/storage"] });
      toast({
        title: "Message deleted",
        description: "The message has been deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete message",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (chatWithMembers && user) {
      sendWsMessage({
        type: 'join_chat',
        data: { chatId: chatWithMembers.id, userId: user.id },
      });

      // Mark messages as seen when entering a chat
      const markAsSeen = async () => {
        try {
          await apiRequest("POST", `/api/chats/${chatWithMembers.id}/mark-seen`);
        } catch (error) {
          console.error("Failed to mark messages as seen:", error);
        }
      };
      markAsSeen();
    }
  }, [chatWithMembers, user, sendWsMessage]);

  // This effect is now redundant because the above effect handles marking messages as seen.
  // // Mark messages as seen when messages are visible (only for messages from other users)
  // useEffect(() => {
  //   if (chatWithMembers && user && messages.length > 0) {
  //     const markAsSeen = async () => {
  //       try {
  //         await apiRequest("POST", `/api/chats/${chatWithMembers.id}/mark-seen`);
  //       } catch (error) {
  //         console.error("Failed to mark messages as seen:", error);
  //       }
  //     };

  //     // Add a small delay to simulate "viewing" the messages
  //     const timeoutId = setTimeout(markAsSeen, 1000);
  //     return () => clearTimeout(timeoutId);
  //   }
  // }, [chatWithMembers, user, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getChatDisplayName = () => {
    if (!chatWithMembers) return "";
    
    if (chatWithMembers.isGroup) {
      return chatWithMembers.name || "Group Chat";
    } else {
      // Check if chat has members array
      if ('members' in chatWithMembers && Array.isArray(chatWithMembers.members)) {
        const otherUser = chatWithMembers.members.find((m: any) => m.userId !== user?.id)?.user;
        return (
          otherUser?.displayName ||
          `${otherUser?.firstName || ''} ${otherUser?.lastName || ''}`.trim() ||
          otherUser?.username ||
          "Unknown User"
        );
      }
      return "Contact"; // Fallback if no member data
    }
  };

  const getGroupMemberNames = () => {
    if (!chatWithMembers || !chatWithMembers.isGroup) return "";
    
    if ('members' in chatWithMembers && Array.isArray(chatWithMembers.members)) {
      const memberNames = chatWithMembers.members
        .map((m: any) => {
          const memberUser = m.user;
          return (
            memberUser?.displayName ||
            `${memberUser?.firstName || ''} ${memberUser?.lastName || ''}`.trim() ||
            memberUser?.username ||
            "Unknown User"
          );
        })
        .filter(Boolean);
      
      return memberNames.join(", ");
    }
    
    return "";
  };

  const getOtherUserId = () => {
    if (!chatWithMembers || chatWithMembers.isGroup) return null;
    if ('members' in chatWithMembers && Array.isArray(chatWithMembers.members)) {
      const otherUser = chatWithMembers.members.find((m: any) => m.userId !== user?.id);
      return otherUser?.userId || null;
    }
    return null;
  };

  const getOtherUser = () => {
    if (!chatWithMembers || chatWithMembers.isGroup) return null;
    if ('members' in chatWithMembers && Array.isArray(chatWithMembers.members)) {
      const otherUser = chatWithMembers.members.find((m: any) => m.userId !== user?.id);
      return otherUser?.user || null;
    }
    return null;
  };

  const isOtherUserOnline = () => {
    const otherUserId = getOtherUserId();
    return otherUserId ? onlineUsers.has(otherUserId) : false;
  };

  const formatMessageTime = (dateString: string | Date | null) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleDeleteChat = () => {
    if (chatWithMembers) {
      deleteChatMutation.mutate(chatWithMembers.id);
    }
  };

  const handleDeleteMessage = (message: Message) => {
    setMessageToDelete(message);
  };

  const confirmDeleteMessage = () => {
    if (messageToDelete) {
      deleteMessageMutation.mutate(messageToDelete.id);
      setMessageToDelete(null);
    }
  };

  if (!chatWithMembers) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="text-center text-gray-400">
          <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="h-12 w-12" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Welcome to PandaNet</h3>
          <p>Select a chat to start messaging</p>
        </div>
      </div>
    );
  }



  return (
    <div className="flex-1 flex flex-col bg-black">
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {chatWithMembers.isGroup ? (
              <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center">
                <Users className="h-6 w-6 text-white" />
              </div>
            ) : (
              <Avatar className="w-12 h-12 border-2 border-purple-600">
                <AvatarImage src={(() => {
                  if ('members' in chatWithMembers && Array.isArray(chatWithMembers.members)) {
                    const otherUser = chatWithMembers.members.find((m: any) => m.userId !== user?.id)?.user;
                    return otherUser?.profileImageUrl || undefined;
                  }
                  return undefined;
                })()} />
                <AvatarFallback className="bg-gray-600 text-white">
                  {getChatDisplayName().charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
            <div 
              className={!chatWithMembers.isGroup ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}
              onClick={() => {
                if (!chatWithMembers.isGroup) {
                  setShowProfilePreview(true);
                }
              }}
            >
              <h3 className="font-semibold">{getChatDisplayName()}</h3>
              <p className="text-sm text-gray-400">
                {chatWithMembers.isGroup 
                  ? getGroupMemberNames()
                  : typingUsers.size > 0 
                    ? "Typing..." 
                    : isOtherUserOnline() 
                      ? "Online" 
                      : "Offline"
                }
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700 text-white">
                <DropdownMenuItem 
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-400 hover:text-red-300 hover:bg-gray-700 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center text-gray-400">Loading messages...</div>
          ) : messages.length > 0 ? (
            messages.map((message: Message & { sender: User }) => {
              const isOwnMessage = message.senderId === user?.id;
              
              return (
                <div
                  key={message.id}
                  className={`flex items-start space-x-3 ${
                    isOwnMessage ? 'justify-end' : ''
                  }`}
                >
                  {!isOwnMessage && (
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={message.sender.profileImageUrl || undefined} />
                      <AvatarFallback className="bg-gray-600 text-white text-xs">
                        {message.sender.displayName?.charAt(0) || 
                        message.sender.firstName?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  
                  <div className={isOwnMessage ? 'order-first' : ''}>
                    <div className="relative group">
                      <div
                        className={`rounded-2xl p-4 max-w-md ${
                          isOwnMessage
                            ? 'bg-purple-600 text-white rounded-tr-md'
                            : 'bg-gray-800 text-white rounded-tl-md'
                        }`}
                      >
                        {message.messageType === 'text' ? (
                          <p>{message.content}</p>
                        ) : (
                          <div>
                            {message.mediaUrl && (
                              <>
                                {message.messageType === 'image' && (
                                  <img 
                                    src={message.mediaUrl} 
                                    alt={message.mediaName || 'Image'} 
                                    className="rounded-lg max-w-full h-auto mb-2"
                                  />
                                )}
                                {message.messageType === 'video' && (
                                  <video 
                                    src={message.mediaUrl} 
                                    controls 
                                    className="rounded-lg max-w-full h-auto mb-2"
                                  />
                                )}
                                {message.messageType === 'document' && (
                                  <div className="flex items-center space-x-2 p-2 bg-gray-700 rounded-lg mb-2">
                                    <div className="w-8 h-8 bg-purple-600 rounded flex items-center justify-center">
                                      📄
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium">{message.mediaName}</p>
                                      <p className="text-xs text-gray-400">
                                        {message.mediaSize && `${(message.mediaSize / 1024).toFixed(1)} KB`}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                            {message.content && <p>{message.content}</p>}
                          </div>
                        )}
                      </div>
                      
                      {/* Message options dropdown (only for own messages) */}
                      {isOwnMessage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white hover:bg-gray-700"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700 text-white">
                            <DropdownMenuItem 
                              onClick={() => handleDeleteMessage(message)}
                              className="text-red-400 hover:text-red-300 hover:bg-gray-700 cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Message
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <div 
                      className={`flex items-center justify-between mt-1 ${
                        isOwnMessage ? 'flex-row-reverse mr-2' : 'ml-2'
                      }`}
                    >
                      <p className="text-xs text-gray-400">
                        {formatMessageTime(message.createdAt)}
                      </p>
                      {isOwnMessage && (
                        <ReadReceipts 
                          status={(message.status || "sent") as "sent" | "delivered" | "seen"} 
                          className="ml-2" 
                        />
                      )}
                    </div>
                  </div>
                  
                  {isOwnMessage && (
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={user?.profileImageUrl || undefined} />
                      <AvatarFallback className="bg-gray-600 text-white text-xs">
                        {user?.displayName?.charAt(0) || user?.firstName?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center text-gray-400">
              <p>No messages yet. Start the conversation!</p>
            </div>
          )}
          
          {/* Typing Indicator */}
          {typingUsers.size > 0 && (
            <div className="flex items-start space-x-3">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-gray-600 text-white text-xs">?</AvatarFallback>
              </Avatar>
              <div>
                <div className="bg-gray-800 rounded-2xl rounded-tl-md p-4">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                    <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Message Input */}
      <MessageInput 
        chatId={chatWithMembers.id} 
        onTyping={(isTyping) => {
          sendWsMessage({
            type: 'typing',
            data: { typing: isTyping },
          });
        }}
      />

      {/* Delete Chat Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat? This action cannot be undone and all messages will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600 text-white hover:bg-gray-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteChat}
              disabled={deleteChatMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteChatMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Message Confirmation Dialog */}
      <AlertDialog open={!!messageToDelete} onOpenChange={() => setMessageToDelete(null)}>
        <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this message? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600 text-white hover:bg-gray-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteMessage}
              disabled={deleteMessageMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMessageMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Profile Preview Dialog */}
      <ProfilePreview
        open={showProfilePreview}
        onOpenChange={setShowProfilePreview}
        user={getOtherUser()}
      />
    </div>
  );
}
