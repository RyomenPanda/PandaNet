import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

interface GroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GroupModal({ open, onOpenChange }: GroupModalProps) {
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // For this demo, we'll use existing chats to get available users
  // In a real app, you'd have a separate users endpoint
  const { data: chats } = useQuery({
    queryKey: ["/api/chats"],
    enabled: open,
  });

  const createGroupMutation = useMutation({
    mutationFn: async (groupData: any) => {
      const response = await apiRequest("POST", "/api/chats", groupData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      toast({
        title: "Success",
        description: "Group created successfully",
      });
      onOpenChange(false);
      setGroupName("");
      setSelectedMembers([]);
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
        description: "Failed to create group",
        variant: "destructive",
      });
    },
  });

  // Extract unique users from existing chats
  const availableUsers = chats ? 
    Array.from(
      new Map(
        chats
          .flatMap((chat: any) => chat.members || [])
          .map((member: any) => [member.user.id, member.user])
      ).values()
    ) : [];

  const handleCreateGroup = () => {
    if (!groupName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a group name",
        variant: "destructive",
      });
      return;
    }

    if (selectedMembers.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one member",
        variant: "destructive",
      });
      return;
    }

    createGroupMutation.mutate({
      name: groupName,
      isGroup: true,
      members: selectedMembers,
    });
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle>Create New Group</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="groupName">Group Name</Label>
            <Input
              id="groupName"
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name..."
              className="bg-black border-gray-600 focus:border-purple-600 text-white"
            />
          </div>
          
          <div>
            <Label>Add Members</Label>
            <ScrollArea className="h-40 mt-2">
              <div className="space-y-2">
                {availableUsers.map((user: any) => (
                  <div
                    key={user.id}
                    className="flex items-center space-x-3 p-2 hover:bg-gray-700 rounded-lg cursor-pointer"
                    onClick={() => toggleMember(user.id)}
                  >
                    <Checkbox
                      checked={selectedMembers.includes(user.id)}
                      onCheckedChange={() => toggleMember(user.id)}
                      className="border-gray-600 data-[state=checked]:bg-purple-600"
                    />
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={user.profileImageUrl || undefined} />
                      <AvatarFallback className="bg-gray-600 text-white text-xs">
                        {user.displayName?.charAt(0) || user.firstName?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span>
                      {user.displayName || 
                       `${user.firstName || ''} ${user.lastName || ''}`.trim() || 
                       'Unknown User'}
                    </span>
                  </div>
                ))}
                
                {availableUsers.length === 0 && (
                  <div className="text-center text-gray-400 py-4">
                    No contacts available. Start a conversation with someone first.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          
          <div className="flex space-x-3">
            <Button
              onClick={handleCreateGroup}
              disabled={createGroupMutation.isPending}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              {createGroupMutation.isPending ? "Creating..." : "Create Group"}
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="flex-1 border-gray-600 text-white hover:bg-gray-700"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
