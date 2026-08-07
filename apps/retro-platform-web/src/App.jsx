import { Routes, Route } from 'react-router-dom'
import './App.css'
import { UserProvider } from './context/UserContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import IdentityGate from './components/IdentityGate.jsx'
import Header from './components/Header.jsx'
import Home from './pages/Home.jsx'
import CreateRoom from './pages/CreateRoom.jsx'
import JoinRoom from './pages/JoinRoom.jsx'
import RoomLobby from './pages/RoomLobby.jsx'
import GameVote from './pages/GameVote.jsx'
import GameStarting from './pages/GameStarting.jsx'
import NotFound from './pages/NotFound.jsx'

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <UserProvider>
          <IdentityGate>
            <Header />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/room/create" element={<CreateRoom />} />
              <Route path="/room/join" element={<JoinRoom />} />
              <Route path="/room/:roomCode" element={<RoomLobby />} />
              <Route path="/room/:roomCode/games" element={<GameVote />} />
              <Route path="/room/:roomCode/game/:gameId" element={<GameStarting />} />
              <Route path="/create-room" element={<CreateRoom />} />
              <Route path="/join-room" element={<JoinRoom />} />
              <Route path="/oda/:roomCode" element={<RoomLobby />} />
              <Route path="/oda/:roomCode/oylama" element={<GameVote />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </IdentityGate>
        </UserProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App
