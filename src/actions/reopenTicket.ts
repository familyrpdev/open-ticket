///////////////////////////////////////
//TICKET REOPENING SYSTEM
///////////////////////////////////////
import {opendiscord, api, utilities} from "../index.js"
import * as discord from "discord.js"

const generalConfig = opendiscord.configs.get("opendiscord:general")
const interactiveMsgState = opendiscord.states.get("opendiscord:interactive-message")

export async function registerActions(){
    opendiscord.actions.add(new api.ODAction("opendiscord:reopen-ticket"))
    opendiscord.actions.get("opendiscord:reopen-ticket").workers.add([
        new api.ODWorker("opendiscord:reopen-ticket",2,async (instance,params,origin,cancel) => {
            const {guild,channel,user,ticket,reason} = params
            if (channel.isThread()) throw new api.ODSystemError("Unable to reopen ticket! Open Ticket doesn't support threads!")

            await opendiscord.events.get("onTicketReopen").emit([ticket,user,channel,reason])

            //update ticket
            ticket.get("opendiscord:reopened").value = true
            ticket.get("opendiscord:reopened-by").value = user.id
            ticket.get("opendiscord:reopened-on").value = new Date().getTime()
            
            ticket.get("opendiscord:closed").value = false
            ticket.get("opendiscord:closed-by").value = null
            ticket.get("opendiscord:closed-on").value = null
            
            ticket.get("opendiscord:autoclosed").value = false
            ticket.get("opendiscord:open").value = true
            ticket.get("opendiscord:busy").value = true

            if (generalConfig.data.system.disableAutocloseAfterReopen){
                //disable autoclose after reopen
                ticket.get("opendiscord:autoclose-enabled").value = false
                ticket.get("opendiscord:autoclose-hours").value = 0
            }

            //update stats
            await opendiscord.statistics.get("opendiscord:global").setStat("opendiscord:tickets-reopened",1,"increase")
            await opendiscord.statistics.get("opendiscord:user").setStat("opendiscord:tickets-reopened",user.id,1,"increase")

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
                            opendiscord.log("Ticket Reopening Error: Unable to find category! #1","error",[
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
                                    opendiscord.log("Ticket Reopening Error: Unable to find category! #2","error",[
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
                        opendiscord.log("Unable to move ticket to 'reopened category'!","error",[
                            {key:"channel",value:"#"+channel.name},
                            {key:"channelid",value:channel.id,hidden:true},
                        ])
                        opendiscord.debugfile.writeErrorMessage(new api.ODError(e,"uncaughtException"))
                    }
                }else{
                    channel.setParent(null,{lockPermissions:false})
                    ticket.get("opendiscord:category-mode").value = null
                    ticket.get("opendiscord:category").value = null
                }
            }

            //update permissions
            const permissions: discord.OverwriteResolvable[] = [{
                type:discord.OverwriteType.Role,
                id:guild.roles.everyone.id,
                allow:[],
                deny:["ViewChannel","SendMessages","ReadMessageHistory"]
            }]
            const globalAdmins = opendiscord.configs.get("opendiscord:general").data.globalAdmins
            const optionAdmins = ticket.option.get("opendiscord:admins").value
            const readonlyAdmins = ticket.option.get("opendiscord:admins-readonly").value

            globalAdmins.forEach((admin) => {
                permissions.push({
                    type:discord.OverwriteType.Role,
                    id:admin,
                    allow:["ViewChannel","SendMessages","AddReactions","AttachFiles","SendPolls","ReadMessageHistory","ManageMessages"],
                    deny:[]
                })
            })
            optionAdmins.forEach((admin) => {
                if (globalAdmins.includes(admin)) return
                permissions.push({
                    type:discord.OverwriteType.Role,
                    id:admin,
                    allow:["ViewChannel","SendMessages","AddReactions","AttachFiles","SendPolls","ReadMessageHistory","ManageMessages"],
                    deny:[]
                })
            })
            readonlyAdmins.forEach((admin) => {
                if (globalAdmins.includes(admin)) return
                if (optionAdmins.includes(admin)) return
                permissions.push({
                    type:discord.OverwriteType.Role,
                    id:admin,
                    allow:["ViewChannel","ReadMessageHistory"],
                    deny:["SendMessages","AddReactions","AttachFiles","SendPolls"]
                })
            })
            ticket.get("opendiscord:participants").value.forEach((participant) => {
                //all participants that aren't roles/admins
                if (participant.type == "user"){
                    permissions.push({
                        type:discord.OverwriteType.Member,
                        id:participant.id,
                        allow:["ViewChannel","SendMessages","AddReactions","AttachFiles","SendPolls","ReadMessageHistory"],
                        deny:[]
                    })
                }
            })
            channel.permissionOverwrites.set(permissions)

            //update ticket message
            const ticketMessage = await opendiscord.tickets.getTicketMessage(ticket)
            if (ticketMessage){
                try{
                    ticketMessage.edit((await opendiscord.builders.messages.getSafe("opendiscord:ticket-message").build("other",{guild,channel,user,ticket})).message)
                }catch(e){
                    opendiscord.log("Unable to edit ticket message on ticket reopening!","error",[
                        {key:"channel",value:"#"+channel.name},
                        {key:"channelid",value:channel.id,hidden:true},
                        {key:"messageid",value:ticketMessage.id},
                        {key:"option",value:ticket.option.id.value}
                    ])
                    opendiscord.debugfile.writeErrorMessage(new api.ODError(e,"uncaughtException"))
                }
            }

            if (params.sendMessage){
                const sentMsg = await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:reopen-message").build(origin,{guild,channel,user,ticket,reason})).message)
                if (sentMsg) await interactiveMsgState.setMsgState({channel,message:sentMsg},{
                    messageType:"reopen-message",
                    messageOrigin:"other",
                    messageAuthor:user.id,
                    messageReason:reason
                },false)
            }
            ticket.get("opendiscord:busy").value = false
            await opendiscord.events.get("afterTicketReopened").emit([ticket,user,channel,reason])

            //update channel topic
            await opendiscord.actions.get("opendiscord:update-ticket-topic").run("ticket-action",{guild,channel,user,ticket,sendMessage:false,newTopic:null})
        }),
        new api.ODWorker("opendiscord:discord-logs",1,async (instance,params,origin,cancel) => {
            const {guild,channel,user,ticket,reason} = params

            //to logs
            if (generalConfig.data.system.logs.enabled && generalConfig.data.system.messages.reopening.logs){
                const logChannel = opendiscord.posts.get("opendiscord:logs")
                if (logChannel) logChannel.send(await opendiscord.builders.messages.getSafe("opendiscord:ticket-action-logs").build(origin,{guild,channel,user,ticket,mode:"reopen",reason,additionalData:null}))
            }

            //to dm
            const creator = await opendiscord.tickets.getTicketUser(ticket,"creator")
            if (creator && generalConfig.data.system.messages.reopening.dm) await opendiscord.client.sendUserDm(creator,await opendiscord.builders.messages.getSafe("opendiscord:ticket-action-dm").build(origin,{guild,channel,user,ticket,mode:"reopen",reason,additionalData:null}))
        }),
        new api.ODWorker("opendiscord:logs",0,(instance,params,origin,cancel) => {
            const {guild,channel,user,ticket} = params

            opendiscord.log(user.displayName+" reopened a ticket!","info",[
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