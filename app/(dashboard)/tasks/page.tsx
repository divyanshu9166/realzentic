import TasksClient from './TasksClient'

export const metadata = {
    title: 'Tasks & Reminders | Realzentic',
    description: 'Agent to-do and reminder management.',
}

export default function TasksPage() {
    return <TasksClient />
}
