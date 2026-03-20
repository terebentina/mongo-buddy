import { Toaster as Sonner } from 'sonner'

const Toaster = (props: React.ComponentProps<typeof Sonner>): JSX.Element => (
  <Sonner theme="system" className="toaster group" {...props} />
)

export { Toaster }
