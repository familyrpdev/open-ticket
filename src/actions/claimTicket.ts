///////////////////////////////////////
//TICKET CLAIMING SYSTEM
///////////////////////////////////////
import {opendiscord, api, utilities} from "../index.js"
import * as discord from "discord.js"

const generalConfig = opendiscord.configs.get("opendiscord:general")
const interactiveMsgState = opendiscord.states.get("opendiscord:interactive-message")

export async function registerActions(){
    opendiscord.actions.add(new api.ODAction("opendiscord:claim-ticket"))
    opendiscord.actions.get("opendiscord:claim-ticket").workers.add([
        new api.ODWorker("opendiscord:claim-ticket",2,async (instance,params,origin,cancel) => {
            const {guild,channel,user,ticket,reason} = params
            if (channel.isThread()) throw new api.ODSystemError("Unable to claim ticket! Open Ticket doesn't support threads!")

            await opendiscord.events.get("onTicketClaim").emit([ticket,user,channel,reason])
            
            //update ticket
            ticket.get("opendiscord:claimed").value = true
            ticket.get("opendiscord:claimed-by").value = user.id
            ticket.get("opendiscord:claimed-on").value = new Date().getTime()
            ticket.get("opendiscord:busy").value = true

            //update stats
            await opendiscord.statistics.get("opendiscord:global").setStat("opendiscord:tickets-claimed",1,"increase")
            await opendiscord.statistics.get("opendiscord:user").setStat("opendiscord:tickets-claimed",user.id,1,"increase")

            //update category
            if (typeof params.allowCategoryChange == "boolean" ? params.allowCategoryChange : true){
                const rawClaimCategory = ticket.option.get("opendiscord:channel-categories-claimed").value.find((c) => c.user == user.id)
                const claimCategory = (rawClaimCategory) ? rawClaimCategory.category : null
                if (claimCategory){
                    try {
                        channel.setParent(claimCategory,{lockPermissions:false})
                        ticket.get("opendiscord:category-mode").value = "claimed"
                        ticket.get("opendiscord:category").value = claimCategory
                    }catch(e){
                        opendiscord.log("Unable to move ticket to 'claimed category'!","error",[
                            {key:"channel",value:"#"+channel.name},
                            {key:"channelid",value:channel.id,hidden:true},
                            {key:"categoryid",value:claimCategory}
                        ])
                        opendiscord.debugfile.writeErrorMessage(new api.ODError(e,"uncaughtException"))
                    }
                }
            }

            //update ticket message
            const ticketMessage = await opendiscord.tickets.getTicketMessage(ticket)
            if (ticketMessage){
                try{
                    ticketMessage.edit((await opendiscord.builders.messages.getSafe("opendiscord:ticket-message").build("other",{guild,channel,user,ticket})).message)
                }catch(e){
                    opendiscord.log("Unable to edit ticket message on ticket claiming!","error",[
                        {key:"channel",value:"#"+channel.name},
                        {key:"channelid",value:channel.id,hidden:true},
                        {key:"messageid",value:ticketMessage.id},
                        {key:"option",value:ticket.option.id.value}
                    ])
                    opendiscord.debugfile.writeErrorMessage(new api.ODError(e,"uncaughtException"))
                }
            }

            //reply with new message
            if (params.sendMessage){
                const sentMsg = await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:claim-message").build(origin,{guild,channel,user,ticket,reason})).message)
                if (sentMsg) await interactiveMsgState.setMsgState({channel,message:sentMsg},{
                    messageType:"claim-message",
                    messageOrigin:"other",
                    messageAuthor:user.id,
                    messageReason:reason
                },false)
            }
            ticket.get("opendiscord:busy").value = false
            await opendiscord.events.get("afterTicketClaimed").emit([ticket,user,channel,reason])

            //update channel topic
            await opendiscord.actions.get("opendiscord:update-ticket-topic").run("ticket-action",{guild,channel,user,ticket,sendMessage:false,newTopic:null})
        }),
        new api.ODWorker("opendiscord:discord-logs",1,async (instance,params,origin,cancel) => {
            const {guild,channel,user,ticket,reason} = params

            //to logs
            if (generalConfig.data.system.logs.enabled && generalConfig.data.system.messages.claiming.logs){
                const logChannel = opendiscord.posts.get("opendiscord:logs")
                if (logChannel) logChannel.send(await opendiscord.builders.messages.getSafe("opendiscord:ticket-action-logs").build(origin,{guild,channel,user,ticket,mode:"claim",reason,additionalData:null}))
            }

            //to dm
            const creator = await opendiscord.tickets.getTicketUser(ticket,"creator")
            if (creator && generalConfig.data.system.messages.claiming.dm) await opendiscord.client.sendUserDm(creator,await opendiscord.builders.messages.getSafe("opendiscord:ticket-action-dm").build(origin,{guild,channel,user,ticket,mode:"claim",reason,additionalData:null}))
        }),
        new api.ODWorker("opendiscord:logs",0,(instance,params,origin,cancel) => {
            const {guild,channel,user,ticket} = params

            opendiscord.log(user.displayName+" claimed a ticket!","info",[
                {key:"user",value:user.username},
                {key:"userid",value:user.id,hidden:true},
                {key:"channel",value:"#"+channel.name},
                {key:"channelid",value:channel.id,hidden:true},
                {key:"reason",value:params.reason ?? "/"},
                {key:"method",value:origin}
            ])
        })
    ])
    opendiscord.actions.get("opendiscord:claim-ticket").workers.backupWorker = new api.ODWorker("opendiscord:cancel-busy",0,(instance,params) => {
        //set busy to false in case of crash or cancel
        params.ticket.get("opendiscord:busy").value = false
    })
}