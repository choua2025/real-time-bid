import { io, type Socket } from "socket.io-client";

// Lazily-created singleton socket, authenticated with the current access token.
// Client-only (guard callers with onMounted / import.meta.client).
let socket: Socket | null = null;

export function useSocket(): Socket {
  const config = useRuntimeConfig();
  const { accessToken } = useAuth();

  if (!socket) {
    socket = io(config.public.socketUrl, {
      // Read the token lazily on every (re)connect so a fresh login is always
      // sent — the socket.io auth middleware runs the callback on each connect.
      auth: (cb) => cb({ token: accessToken.value ?? "" }),
      transports: ["websocket"],
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

// Tear down the current socket so the next useSocket() call rebuilds it with
// the current user's token. Call on every session change (login/logout) so the
// server re-authenticates the connection as the new user — no page refresh.
export function resetSocket() {
  disconnectSocket();
}
