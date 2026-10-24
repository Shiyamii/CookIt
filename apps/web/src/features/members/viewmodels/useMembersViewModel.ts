import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fold } from '@cookit/shared';
import { fetchMembers, MEMBERS_QUERY_KEY } from '../model/members';

/** The members list: the members who chose to appear in it, filtered by name as typed. */
export function useMembersViewModel() {
  const members = useQuery({ queryKey: MEMBERS_QUERY_KEY, queryFn: fetchMembers });
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const words = fold(search).split(/\s+/).filter(Boolean);
    return (members.data ?? []).filter((member) => {
      const text = fold(`${member.name} ${member.username}`);
      return words.every((word) => text.includes(word));
    });
  }, [members.data, search]);

  return {
    loading: members.isPending,
    loadError: members.isError,
    members: shown,
    /** Nobody chose to appear yet (not the same as a search that finds nobody). */
    empty: members.data?.length === 0,
    search,
    setSearch,
  };
}
