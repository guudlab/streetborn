import { Redirect } from 'expo-router';

// Unknown links (a typo, an old invite path) go home instead of showing the router's English fallback.
export default function NotFound() {
  return <Redirect href="/" />;
}
