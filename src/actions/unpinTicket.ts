///////////////////////////////////////
//TICKET UNPINNING SYSTEM
///////////////////////////////////////
import {opendiscord, api, utilities} from "../index.js"
import * as discord from "discord.js"

const generalConfig = opendiscord.configs.get("opendiscord:general")
const interactiveMsgState = opendiscord.states.get("opendiscord:interactive-message")

export async function registerActions(){
    opendiscord.actions.add(new api.ODAction("opendiscord:unpin-ticket"))
    opendiscord.actions.get("opendiscord:unpin-ticket").workers.add([
        new api.ODWorker("opendiscord:unpin-ticket",2,async (instance,params,origin,cancel) => {
            const {guild,channel,user,ticket,reason} = params
            if (channel.isThread()) throw new api.ODSystemError("Unable to unpin ticket! Open Ticket doesn't support threads!")

            await opendiscord.events.get("onTicketUnpin").emit([ticket,user,channel,reason])
            
            //update ticket
            ticket.get("opendiscord:pinned").value = false
            ticket.get("opendiscord:pinned-by").value = null
            ticket.get("opendiscord:pinned-on").value = null
            ticket.get("opendiscord:busy").value = true

            //rename channel (and give error when crashed)
            const pinEmoji = ticket.get("opendiscord:pinned").value ? generalConfig.data.system.pinEmoji : ""
            const priorityEmoji = opendiscord.priorities.getFromPriorityLevel(ticket.get("opendiscord:priority").value).channelEmoji ?? ""

            const originalName = channel.name
            const newName = pinEmoji+priorityEmoji+utilities.trimEmojis(channel.name)
            try{
                await utilities.timedAwait(channel.setName(newName),2500,(err) => {
                    opendiscord.log("Failed to rename channel on ticket unpin","error")
                })
            }catch(err){
                await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:error-channel-rename").build("ticket-unpin",{guild,channel,user,originalName,newName})).message)
            }

            //update ticket message
            const ticketMessage = await opendiscord.tickets.getTicketMessage(ticket)
            if (ticketMessage){
                try{
                    ticketMessage.edit((await opendiscord.builders.messages.getSafe("opendiscord:ticket-message").build("other",{guild,channel,user,ticket})).message)
                }catch(e){
                    opendiscord.log("Unable to edit ticket message on ticket unpinning!","error",[
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
                const sentMsg = await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:unpin-message").build(origin,{guild,channel,user,ticket,reason})).message)
                if (sentMsg) await interactiveMsgState.setMsgState({channel,message:sentMsg},{
                    messageType:"unpin-message",
                    messageOrigin:"other",
                    messageAuthor:user.id,
                    messageReason:reason
                },false)
            }
            ticket.get("opendiscord:busy").value = false
            await opendiscord.events.get("afterTicketUnpinned").emit([ticket,user,channel,reason])

            //update channel topic
            await opendiscord.actions.get("opendiscord:update-ticket-topic").run("ticket-action",{guild,channel,user,ticket,sendMessage:false,newTopic:null})
        }),
        new api.ODWorker("opendiscord:discord-logs",1,async (instance,params,origin,cancel) => {
            const {guild,channel,user,ticket,reason} = params

            //to logs
            if (generalConfig.data.system.logs.enabled && generalConfig.data.system.messages.pinning.logs){
                const logChannel = opendiscord.posts.get("opendiscord:logs")
                if (logChannel) logChannel.send(await opendiscord.builders.messages.getSafe("opendiscord:ticket-action-logs").build(origin,{guild,channel,user,ticket,mode:"unpin",reason,additionalData:null}))
            }

            //to dm
            const creator = await opendiscord.tickets.getTicketUser(ticket,"creator")
            if (creator && generalConfig.data.system.messages.pinning.dm) await opendiscord.client.sendUserDm(creator,await opendiscord.builders.messages.getSafe("opendiscord:ticket-action-dm").build(origin,{guild,channel,user,ticket,mode:"unpin",reason,additionalData:null}))
        }),
        new api.ODWorker("opendiscord:logs",0,(instance,params,origin,cancel) => {
            const {guild,channel,user,ticket} = params

            opendiscord.log(user.displayName+" unpinned a ticket!","info",[
                {key:"user",value:user.username},
                {key:"userid",value:user.id,hidden:true},
                {key:"channel",value:"#"+channel.name},
                {key:"channelid",value:channel.id,hidden:true},
                {key:"reason",value:params.reason ?? "/"},
                {key:"method",value:origin}
            ])
        })
    ])
}