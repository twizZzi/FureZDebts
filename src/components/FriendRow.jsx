import Icon from "./Icon";
import { Avatar, BalanceStack } from "./ui";
import { fullName, handle } from "../lib/format";
import { useUi } from "../useStore";

export default function FriendRow({ friend, showBalance = true }) {
  const { openSheet } = useUi();
  return (
    <button type="button" className="list-item" onClick={() => openSheet("friend", { friendId: friend.id })}>
      <Avatar user={friend} />
      <div>
        <strong>{fullName(friend)}</strong>
        {friend.username && <span>{handle(friend)}</span>}
      </div>
      {showBalance ? <BalanceStack balances={friend.balances} /> : <Icon name="chevronRight" />}
    </button>
  );
}
