///////////////////////////////////////
//TICKET UNCLAIMING SYSTEM
///////////////////////////////////////
import {opendiscord, api, utilities} from "../index.js"
import * as discord from "discord.js"

const generalConfig = opendiscord.configs.get("opendiscord:general")
const interactiveMsgState = opendiscord.states.get("opendiscord:interactive-message")

export async function registerActions(){
    opendiscord.actions.add(new api.ODAction("opendiscord:unclaim-ticket"))
    opendiscord.actions.get("opendiscord:unclaim-ticket").workers.add([
        new api.ODWorker("opendiscord:unclaim-ticket",2,async (instance,params,origin,cancel) => {
            const {guild,channel,user,ticket,reason} = params
            if (channel.isThread()) throw new api.ODSystemError("Unable to unclaim ticket! Open Ticket doesn't support threads!")

            await opendiscord.events.get("onTicketUnclaim").emit([ticket,user,channel,reason])

            //update ticket
            ticket.get("opendiscord:claimed").value = false
            ticket.get("opendiscord:claimed-by").value = null
            ticket.get("opendiscord:claimed-on").value = null
            ticket.get("opendiscord:busy").value = true

            //update category
            if (typeof params.allowCategoryChange == "boolean" ? params.allowCategoryChange : true){
                const channelCategory = ticket.option.get("opendiscord:channel-category").value
                const channelBackupCategory = ticket.option.get("opendiscord:channel-category-backup").value
                if (channelCategory !== ""){
                    //category enabled
                    try {
                        const normalCategory = await opendiscord.client.fetchGuildCategoryChannel(guild,channelCategory)
                        if (!normalCategory){
                            //default category was not found
                            opendiscord.log("Ticket Unclaiming Error: Unable to find category! #1","error",[
                                {key:"categoryid",value:channelCategory},
                                {key:"backup",value:"false"}
                            ])
                        }else{
                            //default category was found
                            if (normalCategory.children.cache.size >= 49 && channelBackupCategory != ""){
                                //use backup category
                                const backupCategory = await opendiscord.client.fetchGuildCategoryChannel(guild,channelBackupCategory)
                                if (!backupCategory){
                                    //default category was not found
                                    opendiscord.log("Ticket Unclaiming Error: Unable to find category! #2","error",[
                                        {key:"categoryid",value:channelBackupCategory},
                                        {key:"backup",value:"true"}
                                    ])
                                }else{
                                    //use backup category
                                    channel.setParent(backupCategory,{lockPermissions:false})
                                    ticket.get("opendiscord:category-mode").value = "backup"
                                    ticket.get("opendiscord:category").value = backupCategory.id
                                }
                            }else{
                                //use default category
                                channel.setParent(normalCategory,{lockPermissions:false})
                                ticket.get("opendiscord:category-mode").value = "normal"
                                ticket.get("opendiscord:category").value = normalCategory.id
                            }
                        }
                        
                    }catch(e){
                        opendiscord.log("Unable to move ticket to 'unclaimed category'!","error",[
                            {key:"channel",value:"#"+channel.name},
                            {key:"channelid",value:channel.id,hidden:true}
                        ])
                        opendiscord.debugfile.writeErrorMessage(new api.ODError(e,"uncaughtException"))
                    }
                }else{
                    channel.setParent(null,{lockPermissions:false})
                    ticket.get("opendiscord:category-mode").value = null
                    ticket.get("opendiscord:category").value = null
                }
            }

            //update ticket message
            const ticketMessage = await opendiscord.tickets.getTicketMessage(ticket)
            if (ticketMessage){
                try{
                    ticketMessage.edit((await opendiscord.builders.messages.getSafe("opendiscord:ticket-message").build("other",{guild,channel,user,ticket})).message)
                }catch(e){
                    opendiscord.log("Unable to edit ticket message on ticket unclaiming!","error",[
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
                const sentMsg = await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:unclaim-message").build(origin,{guild,channel,user,ticket,reason})).message)
                if (sentMsg) await interactiveMsgState.setMsgState({channel,message:sentMsg},{
                    messageType:"unclaim-message",
                    messageOrigin:"other",
                    messageAuthor:user.id,
                    messageReason:reason
                },false)
            }
            ticket.get("opendiscord:busy").value = false
            await opendiscord.events.get("afterTicketUnclaimed").emit([ticket,user,channel,reason])

            //update channel topic
            await opendiscord.actions.get("opendiscord:update-ticket-topic").run("ticket-action",{guild,channel,user,ticket,sendMessage:false,newTopic:null})
        }),
        new api.ODWorker("opendiscord:discord-logs",1,async (instance,params,origin,cancel) => {
            const {guild,channel,user,ticket,reason} = params

            //to logs
            if (generalConfig.data.system.logs.enabled && generalConfig.data.system.messages.claiming.logs){
                const logChannel = opendiscord.posts.get("opendiscord:logs")
                if (logChannel) logChannel.send(await opendiscord.builders.messages.getSafe("opendiscord:ticket-action-logs").build(origin,{guild,channel,user,ticket,mode:"unclaim",reason,additionalData:null}))
            }

            //to dm
            const creator = await opendiscord.tickets.getTicketUser(ticket,"creator")
            if (creator && generalConfig.data.system.messages.claiming.dm) await opendiscord.client.sendUserDm(creator,await opendiscord.builders.messages.getSafe("opendiscord:ticket-action-dm").build(origin,{guild,channel,user,ticket,mode:"unclaim",reason,additionalData:null}))
        }),
        new api.ODWorker("opendiscord:logs",0,(instance,params,origin,cancel) => {
            const {guild,channel,user,ticket} = params

            opendiscord.log(user.displayName+" unclaimed a ticket!","info",[
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