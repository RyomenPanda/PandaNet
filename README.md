# PandaNet

A modern real-time chat application built with React, TypeScript, and WebSocket technology. PandaNet enables secure messaging, group chats, and media sharing with a sleek, responsive interface.

## Features

### 🔐 Authentication System
- User registration and login with username/password  
- Session management using PostgreSQL-backed sessions  
- Authentication-guarded application access with automatic redirects 

### 💬 Real-time Messaging
- **1:1 Conversations**: Direct messaging between users
- **Group Chats**: Create and manage group conversations with multiple participants 
- **WebSocket Integration**: Real-time message delivery and status updates  
- **Message Status Tracking**: Sent, delivered, and seen indicators  

### 📁 Media Sharing
- Support for images, videos, and documents up to 10MB 
- Automatic file type detection and appropriate rendering
- Secure file upload with validation

### 👥 User Management
- **Profile System**: Customizable profiles with display names and profile pictures
- **Contact Discovery**: Search and connect with other users

### 🎨 Modern UI/UX
- Dark theme with purple accent colors 
- Responsive design for desktop and mobile
- Built with shadcn/ui components and Tailwind CSS
- Typing indicators and smooth animations

## Technology Stack

### Frontend
- **React 18+** with TypeScript for type-safe development
- **Vite** for fast development and optimized builds
- **TanStack Query** for server state management
- **wouter** for lightweight client-side routing
- **shadcn/ui** component library with Radix UI primitives
- **Tailwind CSS** for utility-first styling

### Backend
- **Node.js** with Express.js framework  
- **PostgreSQL** database with Drizzle ORM  
- **WebSocket** support for real-time communication  
- **Passport.js** for authentication with local strategy  
- **Multer** for file upload handling 
## Installation & Setup

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- npm or yarn package manager

### Environment Variables
Create a `.env` file in the root directory:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/pandanet
SESSION_SECRET=your-secure-session-secret-here
NODE_ENV=development
```

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/RyomenPanda/PandaNet.git
   cd PandaNet
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the database**
   ```bash
   npm run db:push
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5000`

## Project Structure

```
PandaNet/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/         # Page components (Auth, Chat)
│   │   ├── hooks/         # Custom React hooks
│   │   └── App.tsx        # Main application component
├── server/                # Backend Express application
│   ├── routes.ts         # API route definitions
│   ├── auth.ts           # Authentication setup
│   ├── storage.ts        # Database operations
│   └── index.ts          # Server entry point
├── shared/               # Shared types and schemas
│   └── schema.ts         # Database schema definitions
└── package.json          # Project dependencies and scripts
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Chats
- `GET /api/chats` - Get user's chats
- `POST /api/chats` - Create new chat
- `DELETE /api/chats/:id` - Delete chat

### Messages
- `GET /api/chats/:chatId/messages` - Get chat messages
- `POST /api/chats/:chatId/messages` - Send message 

### File Upload
- `POST /api/upload` - Upload media files

## Database Schema

The application uses PostgreSQL with the following main tables :

- **users**: User profiles and authentication data
- **chats**: Chat room information (1:1 or group)
- **chat_members**: Many-to-many relationship between users and chats
- **messages**: Chat messages with media support and status tracking
- **sessions**: Session storage for authentication

## WebSocket Events

Real-time features are powered by WebSocket events:

- `new_message` - New message received
- `typing` - User typing indicators
- `message_status_update` - Message delivery/read status
- `user_online`/`user_offline` - Presence updates

## Development Scripts

- `npm run dev` - Start development server with hot reload
- `npm run start` - Start production server 
- `npm run check` - TypeScript type checking 
- `npm run db:push` - Push database schema changes 

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.
