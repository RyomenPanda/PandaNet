interface PandaLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function PandaLogo({ size = "md", className = "" }: PandaLogoProps) {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <div className={`${sizeClasses[size]} ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Panda face base (white) */}
        <ellipse cx="50" cy="55" rx="35" ry="32" fill="white" />
        
        {/* Ears (black) */}
        <ellipse cx="25" cy="25" rx="15" ry="18" fill="black" />
        <ellipse cx="75" cy="25" rx="15" ry="18" fill="black" />
        
        {/* Eye patches (black) */}
        <ellipse cx="35" cy="45" rx="12" ry="15" fill="black" />
        <ellipse cx="65" cy="45" rx="12" ry="15" fill="black" />
        
        {/* Eyes (white) */}
        <ellipse cx="35" cy="45" rx="8" ry="10" fill="white" />
        <ellipse cx="65" cy="45" rx="8" ry="10" fill="white" />
        
        {/* Pupils (black) */}
        <circle cx="35" cy="45" r="4" fill="black" />
        <circle cx="65" cy="45" r="4" fill="black" />
        
        {/* Eye highlights */}
        <circle cx="37" cy="43" r="1.5" fill="white" />
        <circle cx="67" cy="43" r="1.5" fill="white" />
        
        {/* Nose (black) */}
        <ellipse cx="50" cy="60" rx="3" ry="2" fill="black" />
        
        {/* Mouth */}
        <path d="M 50 65 Q 45 70 40 65" stroke="black" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M 50 65 Q 55 70 60 65" stroke="black" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
