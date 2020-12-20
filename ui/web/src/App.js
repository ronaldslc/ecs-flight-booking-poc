import './App.css';
import {Route, Switch, Link} from 'react-router-dom'
import HomePage from './pages/HomePage'
import UserPage from './pages/UserPage'
import FlightPage from './pages/FlightPage'

function App() {
  return (
      <div>
          <nav>
              <ul>
                  <li>
                      <Link to="/">Home</Link>
                  </li>
                  <li>
                      <Link to="/flights">Flight</Link>
                  </li>
              </ul>
          </nav>
          <Switch>
              <Route exact path="/" component={HomePage} />
              <Route path="/flights" component={FlightPage} />
              <Route path="/user/:id" component={UserPage} />
          </Switch>
      </div>
  );
}

export default App;
