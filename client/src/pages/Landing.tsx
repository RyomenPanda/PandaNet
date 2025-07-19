import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import PandaLogo from "@/components/PandaLogo";

export default function Landing() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <Card className="w-full max-w-md mx-4 bg-gray-800 border-gray-700">
        <CardContent className="pt-8 pb-8">
          <div className="text-center mb-8">
            <PandaLogo size="lg" className="mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">PandaNet</h1>
            <p className="text-gray-400">Connect with friends instantly</p>
          </div>
          
          <div className="space-y-4">
            <Button 
              onClick={() => window.location.href = '/api/login'}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3"
            >
              Sign In
            </Button>
            <div className="text-center">
              <p className="text-sm text-gray-400">
                Secure authentication powered by modern technology
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
