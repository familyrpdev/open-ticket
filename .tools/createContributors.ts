/// <reference types="node"/>
import fs from "fs"
import path from "path"
import crypto from "crypto"

const contributorData: {contributors:Contributor[],sections:Section[]} = JSON.parse(fs.readFileSync(path.join(process.cwd(),"./.github/CONTRIBUTORS.json")).toString())

//CONSTANTS
const CORNER_RADIUS = 10
const SPACE_MULTIPLIER = 1.2
const SVG_WIDTH = 1000

//TYPES
interface Contributor {
    name:string,
    pictureUrl:string,
    profileUrl:string,
    sectionId:string
}
interface Section {
    name:string,
    id:string,
    pfpSize:number,
    pfpColumns:number,
    withNames:boolean
}


//FUNCTIONS
async function downloadPfpToBase64URL(url:string){
    const res = await fetch(url,{method:"GET"})
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    console.log("Downloaded picture URL:",url)
    return "data:image/png;base64,"+buffer.toString("base64")
}

function createTitle(yPos:number,name:string){
    return `<text x="${20}" y="${yPos+20}" text-anchor="start" class="contributor-tier-title">${name}</text>`
}

async function createPfp(yPos:number,xPos:number,size:number,contributor:Contributor,withNames:boolean){
    const randomId = crypto.randomBytes(8).toString("hex")
    const nameElement = (withNames) ? `<text x="${Math.round(xPos+(size/2))}" y="${yPos+size+20}" text-anchor="middle" fill="currentColor">${contributor.name}</text>` : ""

    return (`<a href="${contributor.profileUrl}" class="contributor-link" target="_blank">
        <clipPath id="clipPath-${randomId}">
            <rect x="${xPos}" y="${yPos}" width="${size}" height="${size}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}"/>
        </clipPath>
        <image x="${xPos}" y="${yPos}" width="${size}" height="${size}" href="${await downloadPfpToBase64URL(contributor.pictureUrl)}" clip-path="url(#clipPath-${randomId})"/>
        ${nameElement}
    </a>`)
}

async function generateSection(yPos:number,section:Section,contributors:Contributor[]){
    let sectionHtml: string = ""
    sectionHtml += createTitle(yPos,section.name)
    const nameOffset = (section.withNames) ? 20 : 0

    //divide contributors in rows
    const groupedContributors: Contributor[][] = []
    let currentGroup: Contributor[] = []
    for (const contributor of contributors){
        currentGroup.push(contributor)
        if (currentGroup.length == section.pfpColumns){
            groupedContributors.push(currentGroup)
            currentGroup = []
        }
    }
    if (currentGroup.length > 0) groupedContributors.push(currentGroup)

    let y = 0
    for (const contributorGroup of groupedContributors){
        let x = 0
        for (const contributor of contributorGroup){
            const pfpYPos = 40 + yPos + (y * ((section.pfpSize * SPACE_MULTIPLIER) + nameOffset))
            const pfpXPos = 20 + (x * section.pfpSize * SPACE_MULTIPLIER)
            sectionHtml += await createPfp(pfpYPos,pfpXPos,section.pfpSize,contributor,section.withNames)
            x++
        }
        y++
    }

    let sectionHeight: number = 40 + (y * ((section.pfpSize * SPACE_MULTIPLIER) + nameOffset))
    return {sectionHtml,sectionHeight}
}

async function generateSections(sections:Section[],contributors:Contributor[]){
    let finalHeight: number = 10
    let finalHtml: string = ""
    for (const section of sections){
        const sectionContributors = contributors.filter((s) => s.sectionId === section.id)
        if (sectionContributors.length < 1) continue
        const {sectionHtml,sectionHeight} = await generateSection(finalHeight,section,sectionContributors)
        
        finalHeight += sectionHeight
        finalHtml += sectionHtml
    }

    finalHeight += 10
    return {finalHeight,finalHtml}
}

function generateFinalHtml(sectionsHtml:string,sectionHeight:number){
    return (`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${SVG_WIDTH} ${sectionHeight}" width="${SVG_WIDTH}" height="${sectionHeight}">
        <style>
        text {
        font-weight: 300;
        font-size: 14px;
        fill: #777777;
        font-family: 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        .contributor-link {
        cursor: pointer;
        }
        .contributor-tier-title {
        font-weight: 500;
        font-size: 20px;
        }
        </style>
        ${sectionsHtml}
    </svg>`)
}

//GENERATE CONTRIBUTORS SVG
async function main(){
    const {finalHeight,finalHtml} = await generateSections(contributorData.sections,contributorData.contributors) 
    fs.writeFileSync(path.join(process.cwd(),"./.github/CONTRIBUTORS.svg"),generateFinalHtml(finalHtml,finalHeight))
}
main()