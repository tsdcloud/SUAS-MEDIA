import prisma from '../prisma/client.js';

export const createWorkShop= async(data)=>{
    if(!data || typeof data !== "object") throw new Error("Invalid data");

    let {workshopId} = data

    try {
        const workshop = await prisma.workshop.upsert({
            where: { workshopId },
            update: { },
            create: { workshopId }
        })
        return workshop;
    } catch (error) {
        returnError(error, "CREATION");
    }
}

export const getAllWorkShop= async()=>{
    try {
        const workshop = await prisma.workshop.findMany({
            where: {isActive: true}
        })
        return workshop;
    } catch (error) {
        returnError(error, "GET ALL");
    }
}

export const getWorkShopById= async(workshopId)=>{
    if(!id || typeof data != "string") throw new Error("Invalid id");
    try {
        const workshop = await prisma.workshop.findMany({
            where: {isActive: true, workshopId}
        })
        return workshop;
    } catch (error) {
        returnError(error, "GET ALL");
    }
}

export const updateWorkshop= async(id, data)=>{
    if(!data || typeof data != "object") throw new Error("Invalid data");
    if(!id || typeof data != "string") throw new Error("Invalid id");
    try {
        const workshop = await prisma.workshop.update({
            where: {id},
            data
        });
        return workshop;
    } catch (error) {
        returnError(error, "UPDATE");
    }
}


const returnError=(error, type)=>{
    return {
        error, type
    }
}
