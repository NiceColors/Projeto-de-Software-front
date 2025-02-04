import { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from "next"
import { parseCookies } from "nookies"

export function withSSRGuest<P extends { [key: string]: unknown }>(fn: GetServerSideProps<P>): GetServerSideProps {
    return async (ctx: GetServerSidePropsContext): Promise<GetServerSidePropsResult<P>> => { //High Order Function 
        const cookies = parseCookies(ctx)
        if (cookies["nextauth.token"]) {
            return {
                redirect: {
                    destination: '/',
                    permanent: false
                }
            }
        }
        return await fn(ctx)
    }
}