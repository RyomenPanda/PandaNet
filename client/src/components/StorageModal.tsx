import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { HardDrive, FileText, AlertCircle, RefreshCw } from "lucide-react";

interface StorageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function StorageModal({ open, onOpenChange }: StorageModalProps) {
  const queryClient = useQueryClient();
  const { data: storageData, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/user/storage"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/user/storage");
      return response.json();
    },
    enabled: open,
  });

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getUsagePercentage = (): number => {
    if (!storageData) return 0;
    return Math.round((storageData.used / storageData.limit) * 100);
  };

  const getProgressColor = (percentage: number): string => {
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 75) return "bg-yellow-500";
    return "bg-green-500";
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Storage Usage</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-400">Loading storage information...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Storage Usage</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="text-red-400 flex items-center space-x-2">
              <AlertCircle className="h-5 w-5" />
              <span>Failed to load storage information</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const usagePercentage = getUsagePercentage();
  const progressColor = getProgressColor(usagePercentage);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <HardDrive className="h-5 w-5" />
              <span>Storage Usage</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isLoading}
              className="text-gray-400 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Storage Progress */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Storage Used</span>
              <span className="text-sm font-medium">
                {formatBytes(storageData?.used || 0)} / {formatBytes(storageData?.limit || 0)}
              </span>
            </div>
            
            <div className="space-y-2">
              <Progress 
                value={usagePercentage} 
                className="h-3 bg-gray-700"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>{usagePercentage}% used</span>
                <span>{formatBytes((storageData?.limit || 0) - (storageData?.used || 0))} remaining</span>
              </div>
            </div>
          </div>

          {/* Storage Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <FileText className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-gray-400">Files</span>
              </div>
              <div className="text-2xl font-bold">{storageData?.files || 0}</div>
            </div>
            
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <HardDrive className="h-4 w-4 text-blue-400" />
                <span className="text-sm text-gray-400">Limit</span>
              </div>
              <div className="text-2xl font-bold">1 GB</div>
            </div>
          </div>

          {/* Storage Info */}
          <div className="bg-gray-700 rounded-lg p-4">
            <h4 className="font-semibold mb-2">Storage Information</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Files are automatically deleted after 7 days</li>
              <li>• Deleted messages also remove associated files</li>
              <li>• Browser caching allows access for 7 days after deletion</li>
              <li>• Storage usage updates in real-time</li>
            </ul>
          </div>

          {/* Warning for high usage */}
          {usagePercentage >= 75 && (
            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4">
              <div className="flex items-center space-x-2 text-yellow-400">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">Storage Warning</span>
              </div>
              <p className="text-sm text-yellow-300 mt-1">
                You're approaching your storage limit. Consider deleting old files to free up space.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 