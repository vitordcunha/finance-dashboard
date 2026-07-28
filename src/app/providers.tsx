import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/features/auth/hooks/AuthProvider';
import { HouseholdProvider } from '@/features/auth/hooks/HouseholdProvider';
import { ScopeProvider } from '@/features/scope/ScopeProvider';

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HouseholdProvider>
          <ScopeProvider>
            {children}
            <Toaster
              position="bottom-center"
              richColors
              closeButton
              toastOptions={{
                className: 'font-sans',
              }}
            />
          </ScopeProvider>
        </HouseholdProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
