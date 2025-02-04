import axios, { AxiosError, HeadersDefaults } from 'axios'
import { GetServerSidePropsContext } from 'next';
import { parseCookies, setCookie } from 'nookies'
import { AuthTokenError } from './Errors/AuthTokenError';
import { signOut } from '../contexts/AuthContext';
interface AxiosErrorResponse {
    message?: string;
}
type FailedRequestsQueueProps = {
    onSuccess: (token: string) => void;
    onFailure: (error: AxiosError) => void;
}

interface CommonHeaderProperties extends HeadersDefaults {
    Authorization: string;
}

let isRefreshing = false
let failedRequestQueue: any = [];

export const setupAPIClient = (ctx: GetServerSidePropsContext | undefined = undefined) => {
    let cookies = parseCookies(ctx);
    console.log('cookies', failedRequestQueue);
    const token = `Bearer ${cookies["nextauth.token"]}`

    const apiUrl = process.env.NEXT_PUBLIC_API_URL
    const api = axios.create({
        baseURL: apiUrl,
        headers: {
            Authorization: token,
        },
    });



    /* 
      request: intercepta a requisição antes que ela seja feita
      response: intercepta a requisição depois que ela for feita, ou seja, posso fazer uma funcionalidade depois da resposta do backend
    */

    // o response.use recebe dois parâmetros: o primeiro é o que fazer se a requisição for um sucesso e o segundo, o que fazer se der algum erro
    api.interceptors.response.use(
        (response) => {
            return response;
        },
        async (error: AxiosError<AxiosErrorResponse>) => {

            if (error!.response!.status === 401) {

                let message = error.response!.data.message;

                if ('error' in error.response!.data)
                    return Promise.reject(error)
                else if (message === "jwt expired" || message === "invalid signature" || message === "Invalid token") {
                    // renovar o token
                    cookies = parseCookies(ctx)

                    const { "nextauth.refreshToken": refreshToken } = cookies;
                    const originalConfig = error.config; // toda a configuração da requisição feita para o backend, como qual rotas eu chamei, quais parâmetros foram passados, o que deveria acontecer depois da requisição ser feita, etc.

                    if (!isRefreshing) {
                        // Quando o token estiver inválido, ele atualiza o token. O refreshing é feito uma única vez, quando o token não está válido.
                        isRefreshing = true;
                        try {
                            const response = await api.post("/refresh-token", {
                                token: refreshToken,
                            })
                            const { token } = response.data;
                            setCookie(ctx, "nextauth.token", token, {
                                maxAge: 60 * 60 * 24 * 30, // (30 days) quanto tempo o cookie deve ser mantido no navegador
                                path: "/", // qualquer endereço da app vai ter acesso ao cookie
                            });

                            api.defaults.headers = {
                                'Authorization': `Bearer ${token}`
                            } as CommonHeaderProperties;

                            failedRequestQueue.forEach((request: any) => request.onSuccess(token));
                            failedRequestQueue = [];

                        } catch (err) {
                            failedRequestQueue.forEach((request: any) => request.onFailure(err));
                            failedRequestQueue = [];

                            if (typeof window !== "undefined") {
                                signOut();
                            }
                        } finally {
                            isRefreshing = false;
                        }
                    }

                    return new Promise((resolve, reject) => {
                        failedRequestQueue.push({
                            onSuccess: (token: string) => {
                                // quando o processo de refresh estiver finalizado
                                originalConfig!.headers = { Authorization: `Bearer ${token}` };

                                resolve(api(originalConfig));
                            },
                            onFailure: (err: AxiosError) => {
                                // quando ocorrer algum erro
                                reject(err);
                            },
                        });

                    });
                } else {
                    // o erro pode não ser do tipo token expirado, portanto o usuário é deslogado
                    if (typeof window !== "undefined") {
                        // Verifia se está no browser. Ele só faz o logout usando a função signOut, se estiver no cliente(browser).
                        signOut();
                    } else {
                        return Promise.reject(new AuthTokenError())
                    }
                }
            }

            return Promise.reject(error);
        }
    );

    return api;
};