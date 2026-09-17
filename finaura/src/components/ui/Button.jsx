// Re-export from the canonical location.
// This shim means both of these import paths work:
//   import { Button } from '../components/Button'
//   import { Button } from '../components/ui/Button'
export { Button, IconButton } from '../Button';
