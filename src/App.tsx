import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Home } from './pages/Home';
import { Studio } from './pages/Studio';
import { Room } from './pages/Room';
import { Sos } from './pages/Sos';
import { Lab } from './pages/Lab';
import { Technology } from './pages/Technology';
import { Impact } from './pages/Impact';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="studio" element={<Studio />} />
          <Route path="room" element={<Room />} />
          <Route path="sos" element={<Sos />} />
          <Route path="lab" element={<Lab />} />
          <Route path="technology" element={<Technology />} />
          <Route path="impact" element={<Impact />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
