import asyncio


class NotificationBus:
    def __init__(self):
        self._queues: dict[int, list[asyncio.Queue]] = {}

    def subscribe(self, user_id: int) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._queues.setdefault(user_id, []).append(q)
        return q

    def unsubscribe(self, user_id: int, queue: asyncio.Queue) -> None:
        queues = self._queues.get(user_id, [])
        if queue in queues:
            queues.remove(queue)
        if not queues:
            self._queues.pop(user_id, None)

    def publish(self, user_id: int, event: dict) -> None:
        for q in self._queues.get(user_id, []):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass  # lagging client — drop silently

    def publish_to_all(self, user_ids: list[int], event: dict) -> None:
        for uid in user_ids:
            self.publish(uid, event)


bus = NotificationBus()
