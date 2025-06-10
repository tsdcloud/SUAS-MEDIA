import prisma from '../prisma/client.js';

export const getMessageByWorkshop = async(workshopId)=>{
    if(!workshopId || typeof workshopId != "string") throw new Error("Invalid data");
    try {
        const messages = await prisma.message.findMany({
            where: { workshopId },
            include: {
                sender: true,
            },
            orderBy: {
                timestamp: 'asc',  // Classement croissant, du plus ancien au plus récent
            }
        });
        return messages;
    } catch (error) {
        return returnError(error, "GET BY FK");
    }
}

export const createMessage = async(data)=>{
    if(!data || typeof data !== "object") throw new Error("Invalid data");
    let {
        workshopId,
        senderId,
        content,
        type,
      } = data
    const workshop = await prisma.workshop.findUnique({
        where: { workshopId },
    });

    if (!workshop) {
        console.error('WorkShop not found');
        return
    }

    const participant = await prisma.participant.findUnique({
        where: { participantId : senderId },
    });

    if(!participant){
        console.log("Participant Not Found")
        return
    }

    try {
        const message = await prisma.message.create({
            data:{
                senderId,
                workshopId,
                type,
                content,
            },
            include: {
                sender: true,
            }
        });

        return message;

    } catch (error) {
        console.log(error)
        returnError(error.meta, "CREATION");
    }
}

const returnError=(error, type)=>{
    return {
        error, type
    }
}
