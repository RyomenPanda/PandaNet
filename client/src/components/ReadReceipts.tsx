import { Check, CheckCheck } from "lucide-react";

interface ReadReceiptsProps {
  status: "sent" | "delivered" | "seen";
  className?: string;
}

export function ReadReceipts({ status, className = "" }: ReadReceiptsProps) {
  const baseClasses = "h-4 w-4";
  
  if (status === "sent") {
    return (
      <Check 
        className={`${baseClasses} text-gray-400 ${className}`}
        strokeWidth={2}
      />
    );
  }
  
  if (status === "delivered") {
    return (
      <CheckCheck 
        className={`${baseClasses} text-gray-400 ${className}`}
        strokeWidth={2}
      />
    );
  }
  
  if (status === "seen") {
    return (
      <CheckCheck 
        className={`${baseClasses} text-blue-500 ${className}`}
        strokeWidth={2}
      />
    );
  }
  
  return null;
}