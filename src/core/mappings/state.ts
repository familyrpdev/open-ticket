///////////////////////////////////////
//OPEN TICKET STATE MAPPINGS
///////////////////////////////////////
import * as api from "@open-discord-bots/framework/api"
import * as discord from "discord.js"

/**## ODStateManagerIdMappings `interface`
 * A list of all available IDs in the default `ODStateManager` class in `opendiscord`.
 * It's used to generate typescript declarations for this class.
 */
export interface ODStateManagerIdMappings extends api.ODStateManagerIdConstraint {
    "opendiscord:message-origin":ODMessageOriginState,
    "opendiscord:verifybar":ODVerifybarState,
}

/////////////////////////////
////// MAPPED MANAGERS //////
/////////////////////////////

/**## ODMappedStateManager `class
 * A special class with types for the Open Ticket `ODStateManager` class.
 */
export class ODMappedStateManager extends api.ODStateManager<ODStateManagerIdMappings> {}

/**## ODMessageOriginState `class
 * A special class with types for the Open Ticket message origin states.
 */
export class ODMessageOriginState extends api.ODState<{
    messageOrigin:"slash"|"text"|"button"|"dropdown"|"modal"|"other",
    messageType:"ticket-message"|"close-message"|"reopen-message"|"autoclose-message"|"claim-message"|"unclaim-message"|"pin-message"|"unpin-message",
},false,false> {}

/**## ODVerifybarState `class
 * A special class with types for the Open Ticket verifybar states.
 */
export class ODVerifybarState extends api.ODState<{
    verifybarId:string,
},false,true> {}