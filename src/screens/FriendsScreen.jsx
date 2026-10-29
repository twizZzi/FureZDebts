import { useMemo } from "react";
import Icon from "../components/Icon";
import FriendRow from "../components/FriendRow";
import { Avatar, Empty } from "../components/ui";
import { fullName, handle } from "../lib/format";
import { shareInvite } from "../lib/invite";
import { confirmAction, haptic } from "../telegram";
import { useStore, useUi } from "../useStore";

function RequestRow({ user, children }) {
  return (
    <div className="list-item">
      <Avatar user={user} />
      <div>
        <strong>{fullName(user)}</strong>
        {user.username && <span>{handle(user)}</span>}
      </div>
      <div className="row-actions">{children}</div>
    </div>
  );
}

export default function FriendsScreen() {
  const { state, mutate } = useStore();
  const { openSheet } = useUi();
  const { friends, incoming, outgoing } = state;

  const sorted = useMemo(
    () => [...friends].sort((a, b) => fullName(a).localeCompare(fullName(b), "ru")),
    [friends]
  );

  const accept = async (user) => {
    if (await mutate("POST", `/friends/${user.id}/accept`)) haptic.success();
  };
  const decline = (user) => mutate("POST", `/friends/${user.id}/decline`);
  const cancel = async (user) => {
    if (await confirmAction(`Отменить заявку для ${fullName(user)}?`)) mutate("DELETE", `/friends/${user.id}`);
  };

  return (
    <>
      <header className="screen-header">
        <div>
          <p className="eyebrow">{friends.length ? `${friends.length} в списке` : "Список пуст"}</p>
          <h1>Друзья</h1>
        </div>
        <button type="button" className="icon-button" onClick={() => openSheet("search")} aria-label="Найти друга">
          <Icon name="userPlus" />
        </button>
      </header>

      {incoming.length > 0 && (
        <>
          <h3 className="section-title">Заявки</h3>
          <div className="list">
            {incoming.map((user) => (
              <RequestRow key={user.id} user={user}>
                <button type="button" className="icon-button small" onClick={() => decline(user)} aria-label="Отклонить">
                  <Icon name="close" size={16} />
                </button>
                <button type="button" className="round-button small" onClick={() => accept(user)} aria-label="Принять">
                  <Icon name="check" size={18} />
                </button>
              </RequestRow>
            ))}
          </div>
        </>
      )}

      {friends.length > 0 ? (
        <>
          <h3 className="section-title">Друзья</h3>
          <div className="list">
            {sorted.map((friend) => (
              <FriendRow key={friend.id} friend={friend} />
            ))}
          </div>
        </>
      ) : (
        <section className="card">
          <Empty
            title="Добавь первого друга"
            text="Бот закрытый: позови друга одноразовой ссылкой-приглашением — после входа вы сразу станете друзьями. Тех, кто уже в боте, можно найти по @username."
          />
          <button type="button" className="primary-button" onClick={shareInvite}>
            <Icon name="share" size={18} />
            Пригласить друга
          </button>
          <button type="button" className="secondary-button" onClick={() => openSheet("search")}>
            <Icon name="search" size={18} />
            Найти по @username
          </button>
        </section>
      )}

      {outgoing.length > 0 && (
        <>
          <h3 className="section-title">Ждут ответа</h3>
          <div className="list">
            {outgoing.map((user) => (
              <RequestRow key={user.id} user={user}>
                <button type="button" className="text-button muted-button" onClick={() => cancel(user)}>
                  Отменить
                </button>
              </RequestRow>
            ))}
          </div>
        </>
      )}

      {friends.length > 0 && (
        <button type="button" className="add-button" onClick={shareInvite}>
          <Icon name="share" size={18} />
          Пригласить друга
        </button>
      )}
    </>
  );
}
