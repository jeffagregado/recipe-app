export default function RecipePage({params}: {params: {id: string}}) {
  return (
    <div>
      <h1>Recipe {params.id}</h1>
    </div>
  );
}