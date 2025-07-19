import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";

interface ProfilePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: number;
    username: string;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    profileImageUrl?: string | null;
    statusMessage?: string | null;
  } | null;
}

export default function ProfilePreview({ open, onOpenChange, user }: ProfilePreviewProps) {
  if (!user) return null;

  const displayName = user.displayName || 
    `${user.firstName || ''} ${user.lastName || ''}`.trim() || 
    user.username;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Avatar Section */}
          <div className="text-center">
            <Avatar className="w-32 h-32 border-4 border-purple-600 mx-auto">
              <AvatarImage src={user.profileImageUrl || undefined} />
              <AvatarFallback className="bg-gray-600 text-white text-4xl">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* User Info */}
          <div className="space-y-4 text-center">
            <div>
              <h3 className="text-xl font-semibold">{displayName}</h3>
              <p className="text-gray-400 text-sm">@{user.username}</p>
            </div>
            
            {user.statusMessage && (
              <div>
                <Badge variant="outline" className="border-purple-600 text-purple-400">
                  <User className="h-3 w-3 mr-1" />
                  {user.statusMessage}
                </Badge>
              </div>
            )}
          </div>

          {/* Additional Info */}
          <div className="space-y-3 text-sm text-gray-400">
            {user.firstName && user.lastName && (
              <div className="flex justify-between">
                <span>Full Name:</span>
                <span className="text-white">{user.firstName} {user.lastName}</span>
              </div>
            )}
            
            <div className="flex justify-between">
              <span>Username:</span>
              <span className="text-white">{user.username}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 