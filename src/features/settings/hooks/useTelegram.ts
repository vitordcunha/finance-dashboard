import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/data/query-keys';
import {
  createTelegramLinkCode,
  getMyTelegramLink,
  revokeTelegramLink,
  updateTelegramLinkDefaults,
} from '@/data/telegram';

export function useTelegramLink() {
  return useQuery({
    queryKey: qk.telegramLink(),
    queryFn: getMyTelegramLink,
  });
}

export function useCreateTelegramLinkCode() {
  return useMutation({
    mutationFn: (input: { personId?: string | null }) =>
      createTelegramLinkCode(input.personId),
  });
}

export function useRevokeTelegramLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => revokeTelegramLink(linkId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.telegramLink() });
    },
  });
}

export function useUpdateTelegramLinkDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateTelegramLinkDefaults,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.telegramLink() });
    },
  });
}
